import { eq, and } from "drizzle-orm";
import { accounts } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Account ID is required.");

  const db = createDb(context.env);
  const row = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.created_by_id, user.id)))
    .limit(1);

  if (!row.length) return error("Account not found.", 404);
  return json(row[0]);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Account ID is required.");

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const updates: Record<string, unknown> = {};
  const { name, type, institution, account_number, balance, color, notes, is_active } = body;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return error("Account name must be a non-empty string.");
    updates.name = name.trim();
  }
  if (type !== undefined) {
    if (typeof type !== "string" || !["cash", "bank", "mobile_wallet"].includes(type)) {
      return error("Type must be 'cash', 'bank', or 'mobile_wallet'.");
    }
    updates.type = type;
  }
  if (institution !== undefined) {
    if (typeof institution !== "string") return error("Institution must be a string.");
    updates.institution = institution;
  }
  if (account_number !== undefined) {
    if (typeof account_number !== "string") return error("Account number must be a string.");
    updates.account_number = account_number;
  }
  if (balance !== undefined) {
    if (typeof balance !== "number") return error("Balance must be a number.");
    updates.balance = balance;
  }
  if (color !== undefined) {
    if (typeof color !== "string") return error("Color must be a string.");
    updates.color = color;
  }
  if (notes !== undefined) {
    updates.notes = typeof notes === "string" ? notes : null;
  }
  if (is_active !== undefined) {
    if (typeof is_active !== "boolean") return error("is_active must be a boolean.");
    updates.is_active = is_active;
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update.");
  }

  const db = createDb(context.env);
  const result = await db
    .update(accounts)
    .set({ ...updates, updated_date: new Date().toISOString() })
    .where(and(eq(accounts.id, id), eq(accounts.created_by_id, user.id)))
    .returning();

  if (!result.length) return error("Account not found.", 404);
  return json(result[0]);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Account ID is required.");

  const db = createDb(context.env);
  await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.created_by_id, user.id)));

  return json({ success: true });
};
