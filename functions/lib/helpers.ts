import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAuth } from "../../src/lib/auth";
import { user } from "../../src/db/schema";

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

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}
