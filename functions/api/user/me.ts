import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { user } from "../../../src/db/schema";
import { createAuth } from "../../../src/lib/auth";
import { json, error } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";
import { MAX_TEXT } from "../../lib/validation";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

export const onRequestGet: PagesFunction<Env> = withErrorHandling(async (context) => {
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
    deletionRequestedAt: rows[0]?.deletionRequestedAt ?? null,
    deletionScheduledFor: rows[0]?.deletionScheduledFor ?? null,
  });
});

export const onRequestPatch: PagesFunction<Env> = withErrorHandling(async (context) => {
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

  // Literal-typed so the Drizzle update below can never pick up a column
  // name that was not explicitly allowed here.
  const updates: Partial<typeof user.$inferInsert> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return error("Name must be a non-empty string.");
    }
    if (body.name.trim().length > MAX_TEXT.name) {
      return error(`Name must be at most ${MAX_TEXT.name} characters.`);
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

  // SEC-05 — Drizzle builder: column names come only from the literal-typed
  // object above, never from request keys, so no SQL is ever assembled from
  // external input (SECURITY.md §3.1). Values are bound by the driver.
  const db = drizzle(context.env.DB);
  await db.update(user).set(updates).where(eq(user.id, session.user.id));

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
    deletionRequestedAt: rows[0]?.deletionRequestedAt ?? null,
    deletionScheduledFor: rows[0]?.deletionScheduledFor ?? null,
  });
});
