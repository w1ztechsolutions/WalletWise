import { eq, and, sql } from "drizzle-orm";
import { budgets } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error, getOwnedCategoryIds } from "../../lib/helpers";
import { MAX_TEXT } from "../../lib/validation";
import { withErrorHandling } from "../../lib/errors";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

export const onRequestGet: PagesFunction<Env> = withErrorHandling(async (context) => {
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
});

export const onRequestPut: PagesFunction<Env> = withErrorHandling(async (context) => {
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
    const categoryId = typeof category_id === "string" ? category_id : null;
    if (categoryId) {
      // SEC-04 — mirror the transaction endpoints' ownership check.
      const ownedCategories = await getOwnedCategoryIds(context.env, user.id, [categoryId]);
      if (!ownedCategories.has(categoryId)) return error("Category not found.", 404);
    }
    updates.category_id = categoryId;
  }
  if (category_name !== undefined) {
    if (typeof category_name !== "string" || !category_name.trim()) {
      return error("Category name must be a non-empty string.");
    }
    if (category_name.length > MAX_TEXT.name) {
      return error(`Category name must be at most ${MAX_TEXT.name} characters.`);
    }
    updates.category_name = category_name.trim();
  }
  if (planned_amount !== undefined) {
    if (typeof planned_amount !== "number" || !Number.isFinite(planned_amount) || planned_amount <= 0) {
      return error("Planned amount must be a positive number.");
    }
    updates.planned_amount = planned_amount;
  }
  if (notes !== undefined) {
    if (typeof notes === "string" && notes.length > MAX_TEXT.notes) {
      return error(`Notes must be at most ${MAX_TEXT.notes} characters.`);
    }
    updates.notes = typeof notes === "string" ? notes : null;
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update.");
  }

  const db = createDb(context.env);

  // SEC-05 — a month/category change that collides with another budget must
  // return the same readable 409 as POST instead of surfacing a raw unique
  // constraint violation as a 500. The index only fires after the write, so
  // check first (excluding the row being edited).
  if (updates.month !== undefined || updates.category_id !== undefined) {
    const [current] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.created_by_id, user.id)))
      .limit(1);
    if (!current) return error("Budget not found.", 404);

    const nextMonth = typeof updates.month === "string" ? updates.month : current.month;
    const nextCategoryId =
      updates.category_id !== undefined
        ? (updates.category_id as string | null)
        : current.category_id;
    const catCondition =
      nextCategoryId !== null
        ? eq(budgets.category_id, nextCategoryId)
        : sql`${budgets.category_id} IS NULL`;
    const clash = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.created_by_id, user.id),
          eq(budgets.month, nextMonth),
          catCondition,
          sql`${budgets.id} <> ${id}`
        )
      )
      .limit(1);
    if (clash.length > 0) {
      return error("A budget already exists for this category in this month.", 409);
    }
  }

  const result = await db
    .update(budgets)
    .set({ ...updates, updated_date: new Date().toISOString() })
    .where(and(eq(budgets.id, id), eq(budgets.created_by_id, user.id)))
    .returning();

  if (!result.length) return error("Budget not found.", 404);
  return json(result[0]);
});

export const onRequestDelete: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Budget ID is required.");

  const db = createDb(context.env);
  const result = await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.created_by_id, user.id)))
    .returning({ id: budgets.id });

  if (!result.length) return error("Budget not found.", 404);
  return json({ success: true });
});
