/**
 * Fixed-window application-layer rate limiter for the `/api/*` surface
 * (audit finding SEC-06; ASVS 11.1.1 / 4.2.2).
 *
 * Counters live in module scope, which on Cloudflare means **per isolate**:
 * limits are therefore approximate across the fleet — each location keeps its
 * own window. That trade-off is deliberate: no new dependency, no D1 write per
 * request, and the expensive paths (credential attempts, AI parse, import
 * commit) are still bounded wherever an attacker's requests land. A Cloudflare
 * WAF rate-limiting rule remains the recommended global layer on top; this is
 * the in-code backstop that ships with the app itself.
 *
 * The 429 envelope reuses the shared typed error contract — `errors.ts` maps
 * 429 → `RATE_LIMITED` — and sets `Retry-After` so well-behaved clients back
 * off instead of hammering.
 */
import { ApiError } from "./errors";

export interface RateLimitRule {
  /** Allowed requests per window. */
  limit: number;
  windowMs: number;
}

/**
 * Bucket policies, keyed by the classification done in `_middleware.ts`.
 * Sized so a full cold-start app load (≈8 parallel queries) and a complete
 * credentialed Playwright run never trip `api`, while the credential and
 * expensive-compute paths stay tight.
 */
export const RATE_LIMIT_RULES = {
  /** Broad per-IP flood cover across every /api/ request. */
  edge: { limit: 900, windowMs: 60_000 },
  /** Credential endpoints: sign-in / sign-up / forget-password attempts. */
  auth: { limit: 15, windowMs: 60_000 },
  /** Worker AI parse — the most expensive read per request. */
  ai: { limit: 10, windowMs: 60_000 },
  /** Spreadsheet import preview/commit — bulk D1 writers. */
  import: { limit: 10, windowMs: 60_000 },
  /** R2 presign / delete traffic. */
  storage: { limit: 30, windowMs: 60_000 },
  /** Authenticated CRUD/analytics default. */
  api: { limit: 600, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMIT_RULES;

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Bounded counter map: a key-rotating flood must not grow isolate memory
 * without limit (availability control). Expired windows are swept first; if
 * the map is still at capacity it is dropped entirely — counters reset, but
 * memory can never be exhausted.
 */
const counters = new Map<string, Counter>();
const MAX_COUNTERS = 10_000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Records one request against `bucket:identity` and reports whether it may proceed. */
export function consumeRateLimit(
  bucket: RateLimitBucket,
  identity: string,
  now = Date.now()
): RateLimitResult {
  const rule = RATE_LIMIT_RULES[bucket];
  const key = `${bucket}:${identity}`;

  if (counters.size >= MAX_COUNTERS) {
    for (const [k, counter] of counters) {
      if (counter.resetAt <= now) counters.delete(k);
    }
    if (counters.size >= MAX_COUNTERS) counters.clear();
  }

  const existing = counters.get(key);
  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true };
  }

  existing.count += 1;
  if (existing.count > rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true };
}

/** 429 + `Retry-After` in the standard `{ error, code }` envelope. */
export function rateLimitedResponse(retryAfterSeconds: number): Response {
  const response = ApiError.fromStatus(
    429,
    "Too many requests. Please wait a moment and try again."
  ).toResponse();
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}