import { eq, and } from "drizzle-orm";
import { categories, transactions } from "../../../src/db/schema";
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
  if (!id) return error("Category ID is required.");

  const db = createDb(context.env);
  const row = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.created_by_id, user.id)))
    .limit(1);

  if (!row.length) return error("Category not found.", 404);
  return json(row[0]);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Category ID is required.");

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const updates: Record<string, unknown> = {};
  const { name, type, color, icon } = body;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return error("Category name must be a non-empty string.");
    updates.name = name.trim();
  }
  if (type !== undefined) {
    if (typeof type !== "string" || !["income", "expense"].includes(type)) {
      return error("Type must be 'income' or 'expense'.");
    }
    updates.type = type;
  }
  if (color !== undefined) {
    if (typeof color !== "string") return error("Color must be a string.");
    updates.color = color;
  }
  if (icon !== undefined) {
    if (typeof icon !== "string") return error("Icon must be a string.");
    updates.icon = icon;
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update.");
  }

  const db = createDb(context.env);
  const result = await db
    .update(categories)
    .set({ ...updates, updated_date: new Date().toISOString() })
    .where(and(eq(categories.id, id), eq(categories.created_by_id, user.id)))
    .returning();

  if (!result.length) return error("Category not found.", 404);
  return json(result[0]);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Category ID is required.");

  const db = createDb(context.env);

  // Check if category is in use by transactions
  const linkedTx = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.category_id, id), eq(transactions.created_by_id, user.id)))
    .limit(1);

  if (linkedTx.length > 0) {
    return error("Cannot delete category. Transactions are linked to it.", 409);
  }

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.created_by_id, user.id)));

  return json({ success: true });
};
