import { eq, and, sql } from "drizzle-orm";
import { accounts, transactions, transfers } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

function normalizeAccountNumber(value: unknown): string {
  if (typeof value !== "string") return "";

  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  return digits.slice(-4);
}

export const onRequestGet: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Account ID is required.");

  const db = createDb(context.env);
  const row = await db
    .select({
      id: accounts.id,
      created_by_id: accounts.created_by_id,
      name: accounts.name,
      type: accounts.type,
      institution: accounts.institution,
      account_number: accounts.account_number,
      opening_balance: accounts.opening_balance,
      balance: sql<number>`${accounts.opening_balance} + COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE -${transactions.amount} END), 0) - COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.from_account_id} = ${accounts.id} AND ${transfers.created_by_id} = ${user.id}), 0) + COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.to_account_id} = ${accounts.id} AND ${transfers.created_by_id} = ${user.id}), 0)`,
      color: accounts.color,
      notes: accounts.notes,
      is_active: accounts.is_active,
      created_date: accounts.created_date,
      updated_date: accounts.updated_date,
    })
    .from(accounts)
    .leftJoin(
      transactions,
      and(eq(transactions.account_id, accounts.id), eq(transactions.created_by_id, user.id))
    )
    .where(and(eq(accounts.id, id), eq(accounts.created_by_id, user.id)))
    .groupBy(accounts.id)
    .limit(1);

  if (!row.length) return error("Account not found.", 404);
  return json(row[0]);
});

export const onRequestPut: PagesFunction<Env> = withErrorHandling(async (context) => {
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
  const { name, type, institution, account_number, color, notes, is_active } = body;

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
    updates.account_number = normalizeAccountNumber(account_number);
  }
  const openingBalance = body.opening_balance ?? body.balance;
  if (openingBalance !== undefined) {
    if (typeof openingBalance !== "number" || !Number.isFinite(openingBalance)) {
      return error("Opening balance must be a valid number.");
    }
    updates.opening_balance = openingBalance;
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
  const [current] = await db
    .select({
      balance: sql<number>`${accounts.opening_balance} + COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE -${transactions.amount} END), 0) - COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.from_account_id} = ${accounts.id} AND ${transfers.created_by_id} = ${user.id}), 0) + COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.to_account_id} = ${accounts.id} AND ${transfers.created_by_id} = ${user.id}), 0)`,
    })
    .from(accounts)
    .leftJoin(
      transactions,
      and(eq(transactions.account_id, accounts.id), eq(transactions.created_by_id, user.id))
    )
    .where(and(eq(accounts.id, id), eq(accounts.created_by_id, user.id)))
    .groupBy(accounts.id)
    .limit(1);
  return json({ ...result[0], balance: current?.balance ?? result[0].opening_balance });
});

export const onRequestDelete: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Account ID is required.");

  const db = createDb(context.env);
  const result = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.created_by_id, user.id)))
    .returning({ id: accounts.id });

  if (!result.length) return error("Account not found.", 404);
  return json({ success: true });
});
