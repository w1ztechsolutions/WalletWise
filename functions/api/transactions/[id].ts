import { eq, and } from "drizzle-orm";
import { transactions, accounts } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
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
  if (!id) return error("Transaction ID is required.");

  const db = createDb(context.env);
  const row = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.created_by_id, user.id)))
    .limit(1);

  if (!row.length) return error("Transaction not found.", 404);
  return json(row[0]);
});

export const onRequestPut: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Transaction ID is required.");

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const updates: Record<string, unknown> = {};
  const { date, amount, description, category_id, category_name, type, is_recurring, notes } = body;

  if (date !== undefined) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return error("Invalid date. Expected YYYY-MM-DD format.");
    }
    updates.date = date;
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) {
      return error("Amount must be a positive number.");
    }
    updates.amount = amount;
  }
  if (description !== undefined) {
    if (typeof description !== "string") return error("Description must be a string.");
    updates.description = description;
  }
  if (category_id !== undefined) {
    updates.category_id = typeof category_id === "string" ? category_id : null;
  }
  if (body.account_id !== undefined) {
    if (body.account_id !== null && typeof body.account_id !== "string") {
      return error("Account must be a valid account ID.");
    }
    const accountId = typeof body.account_id === "string" ? body.account_id.trim() : null;
    if (accountId) {
      const db = createDb(context.env);
      const [ownedAccount] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.created_by_id, user.id)))
        .limit(1);
      if (!ownedAccount) return error("Account not found.", 404);
    }
    updates.account_id = accountId || null;
  }
  if (category_name !== undefined) {
    if (typeof category_name !== "string" || !category_name.trim()) {
      return error("Category name must be a non-empty string.");
    }
    updates.category_name = category_name.trim();
  }
  if (type !== undefined) {
    if (typeof type !== "string" || !["income", "expense"].includes(type)) {
      return error("Type must be 'income' or 'expense'.");
    }
    updates.type = type;
  }
  if (is_recurring !== undefined) {
    if (typeof is_recurring !== "boolean") return error("is_recurring must be a boolean.");
    updates.is_recurring = is_recurring;
  }
  if (notes !== undefined) {
    updates.notes = typeof notes === "string" ? notes : null;
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update.");
  }

  const db = createDb(context.env);
  const result = await db
    .update(transactions)
    .set({ ...updates, updated_date: new Date().toISOString() })
    .where(and(eq(transactions.id, id), eq(transactions.created_by_id, user.id)))
    .returning();

  if (!result.length) return error("Transaction not found.", 404);
  return json(result[0]);
});

export const onRequestDelete: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Transaction ID is required.");

  const db = createDb(context.env);
  const result = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.created_by_id, user.id)))
    .returning({ id: transactions.id });

  if (!result.length) return error("Transaction not found.", 404);
  return json({ success: true });
});
