import { eq, and, like, desc } from "drizzle-orm";
import { transactions, categories } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
import { validateTransactionRow } from "../../lib/validation";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");
  const categoryId = url.searchParams.get("category_id");
  const month = url.searchParams.get("month");
  const search = url.searchParams.get("search");

  const db = createDb(context.env);

  const conditions = [eq(transactions.created_by_id, user.id)];
  if (type && (type === "income" || type === "expense")) {
    conditions.push(eq(transactions.type, type));
  }
  if (categoryId) {
    conditions.push(eq(transactions.category_id, categoryId));
  }
  if (month) {
    conditions.push(like(transactions.date, `${month}%`));
  }
  if (search) {
    conditions.push(like(transactions.description, `%${search}%`));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const rows = await db
    .select()
    .from(transactions)
    .where(whereClause)
    .orderBy(desc(transactions.date));

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

  const validated = validateTransactionRow(body);
  if (!validated.ok) {
    return error(validated.reason);
  }

  const db = createDb(context.env);
  const id = crypto.randomUUID();

  const result = await db
    .insert(transactions)
    .values({
      id,
      created_by_id: user.id,
      date: validated.value.date,
      amount: validated.value.amount,
      description: validated.value.description,
      category_id: validated.value.category_id,
      category_name: validated.value.category_name,
      type: validated.value.type,
      is_recurring: validated.value.is_recurring,
      notes: validated.value.notes,
    })
    .returning();

  return json(result[0], 201);
};
