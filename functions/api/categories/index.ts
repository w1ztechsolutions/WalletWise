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

  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");

  const db = createDb(context.env);

  const conditions = [eq(categories.created_by_id, user.id)];
  if (type && (type === "income" || type === "expense")) {
    conditions.push(eq(categories.type, type));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const rows = await db.select().from(categories).where(whereClause);

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

  const { name, type, color, icon } = body;

  if (typeof name !== "string" || !name.trim()) {
    return error("Category name is required.");
  }
  if (typeof type !== "string" || !["income", "expense"].includes(type)) {
    return error("Type must be 'income' or 'expense'.");
  }

  const db = createDb(context.env);
  const id = crypto.randomUUID();

  const result = await db
    .insert(categories)
    .values({
      id,
      created_by_id: user.id,
      name: name.trim(),
      type: type as "income" | "expense",
      color: typeof color === "string" ? color : "#6366f1",
      icon: typeof icon === "string" ? icon : "Tag",
    })
    .returning();

  return json(result[0], 201);
};
