import { eq, and, desc, sql } from "drizzle-orm";
import { budgets } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
import { validateBudgetRow } from "../../lib/validation";
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
});

export const onRequestPost: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const validated = validateBudgetRow(body);
  if (!validated.ok) {
    return error(validated.reason);
  }
  const row = validated.value;

  const db = createDb(context.env);

  // Check for duplicate — also enforced by `budget_user_month_category_idx`, but
  // checking first lets us return a readable 409 instead of a raw constraint
  // error, which is what the UI needs for its "Duplicate budget" toast.
  const catCondition =
    row.category_id !== null
      ? eq(budgets.category_id, row.category_id)
      : sql`${budgets.category_id} IS NULL`;

  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.created_by_id, user.id),
        eq(budgets.month, row.month),
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
      month: row.month,
      category_id: row.category_id,
      category_name: row.category_name,
      planned_amount: row.planned_amount,
      notes: row.notes,
    })
    .returning();

  return json(result[0], 201);
});
