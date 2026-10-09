import { and, eq, sql } from "drizzle-orm";
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

  const db = createDb(context.env);
  const rows = await db
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
    .where(eq(accounts.created_by_id, user.id))
    .groupBy(accounts.id);

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

  const { name, type, institution, account_number, color, notes } = body;
  const openingBalance = body.opening_balance ?? body.balance ?? 0;

  if (typeof name !== "string" || !name.trim()) {
    return error("Account name is required.");
  }
  if (typeof type !== "string" || !["cash", "bank", "mobile_wallet"].includes(type)) {
    return error("Type must be 'cash', 'bank', or 'mobile_wallet'.");
  }
  if (typeof openingBalance !== "number" || !Number.isFinite(openingBalance)) {
    return error("Opening balance must be a valid number.");
  }

  const db = createDb(context.env);
  const id = crypto.randomUUID();

  const result = await db
    .insert(accounts)
    .values({
      id,
      created_by_id: user.id,
      name: name.trim(),
      type: type as "cash" | "bank" | "mobile_wallet",
      institution: typeof institution === "string" ? institution : "",
      account_number: normalizeAccountNumber(account_number),
      opening_balance: openingBalance,
      color: typeof color === "string" ? color : "#3b82f6",
      notes: typeof notes === "string" ? notes : null,
    })
    .returning();

  return json({ ...result[0], balance: openingBalance }, 201);
});
