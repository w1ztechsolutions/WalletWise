import { eq, and, like, desc } from "drizzle-orm";
import { transactions, categories } from "../../../src/db/schema";
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

  const { date, amount, description, category_id, category_name, type, is_recurring, notes } = body;

  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return error("Invalid date. Expected YYYY-MM-DD format.");
  }
  if (typeof amount !== "number" || amount <= 0) {
    return error("Amount must be a positive number.");
  }
  if (typeof type !== "string" || !["income", "expense"].includes(type)) {
    return error("Type must be 'income' or 'expense'.");
  }
  if (typeof category_name !== "string" || !category_name.trim()) {
    return error("Category name is required.");
  }

  const db = createDb(context.env);
  const id = crypto.randomUUID();

  const result = await db
    .insert(transactions)
    .values({
      id,
      created_by_id: user.id,
      date,
      amount,
      description: typeof description === "string" ? description : "",
      category_id: typeof category_id === "string" ? category_id : null,
      category_name: category_name.trim(),
      type: type as "income" | "expense",
      is_recurring: typeof is_recurring === "boolean" ? is_recurring : false,
      notes: typeof notes === "string" ? notes : null,
    })
    .returning();

  return json(result[0], 201);
};
