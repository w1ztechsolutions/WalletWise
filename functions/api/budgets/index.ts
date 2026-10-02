import { eq, and, desc, sql } from "drizzle-orm";
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

  const url = new URL(context.request.url);
  const month = url.searchParams.get("month");

  const db = createDb(context.env);

  const conditions = [eq(budgets.created_by_id, user.id)];
  if (month) {
    conditions.push(eq(budgets.month, month));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const rows = await db
    .select()
    .from(budgets)
    .where(whereClause)
    .orderBy(desc(budgets.month));

  return json(rows);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const { month, category_id, category_name, planned_amount, notes } = body;

  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    return error("Invalid month. Expected YYYY-MM format.");
  }
  if (typeof category_name !== "string" || !category_name.trim()) {
    return error("Category name is required.");
  }
  if (typeof planned_amount !== "number" || planned_amount <= 0) {
    return error("Planned amount must be a positive number.");
  }

  const db = createDb(context.env);

  // Check for duplicate
  const catCondition =
    typeof category_id === "string"
      ? eq(budgets.category_id, category_id)
      : sql`${budgets.category_id} IS NULL`;

  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.created_by_id, user.id),
        eq(budgets.month, month),
        catCondition
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return error("A budget already exists for this category in this month.", 409);
  }

  const id = crypto.randomUUID();
  const result = await db
    .insert(budgets)
    .values({
      id,
      created_by_id: user.id,
      month,
      category_id: typeof category_id === "string" ? category_id : null,
      category_name: category_name.trim(),
      planned_amount,
      notes: typeof notes === "string" ? notes : null,
    })
    .returning();

  return json(result[0], 201);
};
