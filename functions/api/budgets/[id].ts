import { eq, and } from "drizzle-orm";
import { budgets } from "../../../src/db/schema";
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
  if (!id) return error("Budget ID is required.");

  const db = createDb(context.env);
  const row = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.created_by_id, user.id)))
    .limit(1);

  if (!row.length) return error("Budget not found.", 404);
  return json(row[0]);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Budget ID is required.");

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const updates: Record<string, unknown> = {};
  const { month, category_id, category_name, planned_amount, notes } = body;

  if (month !== undefined) {
    if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      return error("Invalid month. Expected YYYY-MM format.");
    }
    updates.month = month;
  }
  if (category_id !== undefined) {
    updates.category_id = typeof category_id === "string" ? category_id : null;
  }
  if (category_name !== undefined) {
    if (typeof category_name !== "string" || !category_name.trim()) {
      return error("Category name must be a non-empty string.");
    }
    updates.category_name = category_name.trim();
  }
  if (planned_amount !== undefined) {
    if (typeof planned_amount !== "number" || planned_amount <= 0) {
      return error("Planned amount must be a positive number.");
    }
    updates.planned_amount = planned_amount;
  }
  if (notes !== undefined) {
    updates.notes = typeof notes === "string" ? notes : null;
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update.");
  }

  const db = createDb(context.env);
  const result = await db
    .update(budgets)
    .set({ ...updates, updated_date: new Date().toISOString() })
    .where(and(eq(budgets.id, id), eq(budgets.created_by_id, user.id)))
    .returning();

  if (!result.length) return error("Budget not found.", 404);
  return json(result[0]);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Budget ID is required.");

  const db = createDb(context.env);
  await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.created_by_id, user.id)));

  return json({ success: true });
};
