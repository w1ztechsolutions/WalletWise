import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAuth } from "../../src/lib/auth";
import { categories, user } from "../../src/db/schema";
import { ApiError } from "./errors";

export interface AuthUser {
  id: string;
  currency: string;
}

export function createDb(env: { DB: D1Database }) {
  return drizzle(env.DB);
}

export async function getAuthUser(
  env: { DB: D1Database },
  request: Request
): Promise<AuthUser | null> {
  const auth = createAuth(env.DB);
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session?.user) return null;

  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return {
    id: session.user.id,
    currency: rows[0]?.currency ?? "MWK",
  };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Builds a sanitized error response.
 *
 * Every existing endpoint already passes deliberately user-safe copy here, so
 * this keeps the exact same wire shape (`{ error, code }`) plus the
 * environment-aware stripping in `ApiError.toResponse`. Kept as a function
 * rather than folded into `json()` so all 29 call sites stay untouched.
 *
 * SECURITY.md §7 is enforced in `ApiError`, not here — a handler that passes
 * raw `err.message` still cannot leak a stack, because `details` is the only
 * field that is dropped in production and this helper never sets it.
 */
export function error(message: string, status = 400): Response {
  return ApiError.fromStatus(status, message).toResponse();
}

/**
 * SEC-04: returns which of `categoryIds` actually belong to `userId`.
 *
 * Mirrors the per-row `account_id` ownership lookups in the transaction and
 * transfer handlers, but batches so the import pipeline can check a whole
 * spreadsheet with a single query instead of N. Call sites must treat a
 * foreign id exactly like a missing one and answer `404` (SECURITY.md §2
 * anti-enumeration: existence of another user's category id is never
 * confirmed).
 */
export async function getOwnedCategoryIds(
  env: { DB: D1Database },
  userId: string,
  categoryIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(categoryIds)];
  if (unique.length === 0) return new Set();

  const db = drizzle(env.DB);
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.created_by_id, userId), inArray(categories.id, unique)));
  return new Set(rows.map((row) => row.id));
}
