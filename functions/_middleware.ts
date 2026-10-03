import { createAuth } from "../src/lib/auth";
import { handleUnexpectedError } from "./lib/errors";

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

  try {
    // Auth routes handle their own session lifecycle. Keep sign-out available,
    // but prevent authenticated account changes during the recovery window.
    if (pathname === "/api/auth" || pathname.startsWith(AUTH_PATH_PREFIX)) {
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
