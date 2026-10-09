import { createAuth } from "../src/lib/auth";
import { handleUnexpectedError } from "./lib/errors";
import {
  consumeRateLimit,
  rateLimitedResponse,
  type RateLimitBucket,
} from "./lib/rate-limit";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

const AUTH_PATH_PREFIX = "/api/auth";
const API_PATH_PREFIX = "/api/";
const ACCOUNT_DELETION_PATH = "/api/user/account-deletion";

function readOnlyResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "Account deletion is pending. Restore your account to make changes.",
      code: "FORBIDDEN",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

async function isDeletionPending(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT deletionScheduledFor FROM "user" WHERE id = ?')
    .bind(userId)
    .first<{ deletionScheduledFor: string | null }>();
  return Boolean(row?.deletionScheduledFor);
}

function isMutation(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

/**
 * Trustworthy client address for IP-keyed buckets. Cloudflare sets this
 * header at the edge; local dev has none, so all local traffic shares one
 * bucket (harmless during development).
 */
function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "local";
}

/**
 * SEC-06 — layered application rate limiting, checked before session or
 * database work so floods are bounded at the cheapest point:
 *
 *  1. `edge` — per-IP cover for every /api/ request, anonymous included.
 *  2. `auth` — per-IP cap on credential mutations (sign-in/sign-up/etc).
 *  3. per-user class buckets (`ai`/`import`/`storage`/`api`) applied once
 *     the session is known, bounding the expensive paths per account.
 *
 * Counters are per-isolate (see `rate-limit.ts`); a global WAF
 * rate-limiting rule remains the recommended outer layer. Denials answer
 * `429` + `Retry-After` with the shared `RATE_LIMITED` code.
 */
function rateLimit(bucket: RateLimitBucket, identity: string): Response | null {
  const result = consumeRateLimit(bucket, identity);
  return result.allowed ? null : rateLimitedResponse(result.retryAfterSeconds);
}

/** Maps an authenticated API path to its per-user bucket. */
function classifyApiRequest(pathname: string): RateLimitBucket {
  if (pathname.startsWith("/api/ai/")) return "ai";
  if (pathname.startsWith("/api/import")) return "import";
  if (pathname.startsWith("/api/storage/")) return "storage";
  return "api";
}

/**
 * Guards `context.next()` and reports anything it throws.
 *
 * Pages Functions middleware exposes no `onError` export, so an unguarded
 * `next()` hands the request to Cloudflare's runtime, which answers with its
 * own opaque error document. `apiFetch` cannot parse that, the user sees a bare
 * "Request failed with status 500", and nothing is written to the Worker log —
 * the worst possible combination. This is the outermost net; individual
 * handlers are additionally wrapped by `withErrorHandling`.
 *
 * A `requestId` is minted here and echoed into every structured log line, so a
 * user-reported failure can be traced to one request.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  context.data.requestId = crypto.randomUUID();

  // Layer 1 — per-IP flood cover across the whole API surface, before any
  // session lookup, so anonymous floods are bounded too.
  const isApiPath = pathname === "/api" || pathname.startsWith(API_PATH_PREFIX);
  if (isApiPath) {
    const limited = rateLimit("edge", clientIp(context.request));
    if (limited) return limited;
  }

  try {
    // Auth routes handle their own session lifecycle. Keep sign-out available,
    // but prevent authenticated account changes during the recovery window.
    if (pathname === "/api/auth" || pathname.startsWith(AUTH_PATH_PREFIX)) {
      // Layer 2 — credential attempts are the most abusable mutations here.
      if (isMutation(context.request.method)) {
        const limited = rateLimit("auth", clientIp(context.request));
        if (limited) return limited;
      }
      if (isMutation(context.request.method) && pathname !== `${AUTH_PATH_PREFIX}/sign-out`) {
        const auth = createAuth(context.env.DB);
        const session = await auth.api.getSession({ headers: context.request.headers });
        if (session?.user && await isDeletionPending(context.env.DB, session.user.id)) {
          return readOnlyResponse();
        }
      }
      return await context.next();
    }

    // Verify session for all other API routes
    if (pathname.startsWith(API_PATH_PREFIX)) {
      const auth = createAuth(context.env.DB);
      const session = await auth.api.getSession({
        headers: context.request.headers,
      });

      if (!session?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          }
        );
      }

      // Inject the authenticated user id so downstream handlers
      // (storage, AI parser, CRUD endpoints) can scope every operation.
      context.data.userId = session.user.id;

      // Layer 3 — per-user caps by expense class.
      const limited = rateLimit(classifyApiRequest(pathname), session.user.id);
      if (limited) return limited;

      if (
        isMutation(context.request.method) &&
        pathname !== ACCOUNT_DELETION_PATH &&
        await isDeletionPending(context.env.DB, session.user.id)
      ) {
        return readOnlyResponse();
      }

      return await context.next();
    }

    // Static assets and non-API routes pass through
    return await context.next();
  } catch (err) {
    return handleUnexpectedError(err, context.env, {
      method: context.request.method,
      path: pathname,
      requestId:
        typeof context.data.requestId === "string"
          ? context.data.requestId
          : undefined,
    });
  }
};
