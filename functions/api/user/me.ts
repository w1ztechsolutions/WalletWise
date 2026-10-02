import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { user } from "../../../src/db/schema";
import { createAuth } from "../../../src/lib/auth";
import { json, error } from "../../lib/helpers";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = createAuth(context.env.DB);
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });

  if (!session?.user) return error("Unauthorized", 401);

  const { id, name, email, image } = session.user;

  const dbq = drizzle(context.env.DB);
  const rows = await dbq.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  const currency = rows[0]?.currency ?? "MWK";

  return json({
    id,
    name,
    email,
    avatar_url: image ?? undefined,
    currency,
  });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = createAuth(context.env.DB);
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });

  if (!session?.user) return error("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return error("Name must be a non-empty string.");
    }
    updates.name = body.name.trim();
  }
  if (body.image !== undefined) {
    updates.image = typeof body.image === "string" ? body.image : null;
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || body.currency.length !== 3) {
      return error("Currency must be a 3-character ISO code.");
    }
    updates.currency = body.currency.toUpperCase();
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update.");
  }

  const db = (context.env.DB as any);
  const fields = Object.keys(updates).map((k) => `"${k}" = ?`).join(", ");
  const values = Object.values(updates);
  values.push(session.user.id);

  await db
    .prepare(`UPDATE user SET ${fields} WHERE id = ?`)
    .bind(...values)
    .run();

  // Re-fetch the updated user
  const updated = await auth.api.getSession({
    headers: context.request.headers,
  });

  if (!updated?.user) return error("User not found.", 404);

  const { id, name, email, image } = updated.user;

  const dbq = drizzle(context.env.DB);
  const rows = await dbq.select().from(user).where(eq(user.id, updated.user.id)).limit(1);
  const currency = rows[0]?.currency ?? "MWK";

  return json({
    id,
    name,
    email,
    avatar_url: image ?? undefined,
    currency,
  });
};
