import { eq, and } from "drizzle-orm";
import { transfers, accounts } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function assertOwned(db: ReturnType<typeof createDb>, userId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.created_by_id, userId)))
    .limit(1);
  return Boolean(row);
}

export const onRequestDelete: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Transfer ID is required.");

  const db = createDb(context.env);
  const result = await db
    .delete(transfers)
    .where(and(eq(transfers.id, id), eq(transfers.created_by_id, user.id)))
    .returning({ id: transfers.id });

  if (!result.length) return error("Transfer not found.", 404);
  return json({ success: true });
});

export const onRequestPut: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const id = String(context.params.id);
  if (!id) return error("Transfer ID is required.");

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const updates: Record<string, unknown> = {};
  const db = createDb(context.env);

  if (body.from_account_id !== undefined || body.to_account_id !== undefined) {
    const [current] = await db
      .select()
      .from(transfers)
      .where(and(eq(transfers.id, id), eq(transfers.created_by_id, user.id)))
      .limit(1);
    if (!current) return error("Transfer not found.", 404);
    const fromId =
      body.from_account_id !== undefined ? String(body.from_account_id) : current.from_account_id;
    const toId =
      body.to_account_id !== undefined ? String(body.to_account_id) : current.to_account_id;
    if (!fromId || !toId) return error("Source and destination accounts are required.");
    if (fromId === toId) return error("Source and destination accounts must differ.");
    const [fromOk, toOk] = await Promise.all([
      assertOwned(db, user.id, fromId),
      assertOwned(db, user.id, toId),
    ]);
    if (!fromOk || !toOk) return error("Account not found.", 404);
    updates.from_account_id = fromId;
    updates.to_account_id = toId;
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
      return error("Amount must be a positive number.");
    }
    updates.amount = body.amount;
  }
  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      return error("Invalid date. Expected YYYY-MM-DD format.");
    }
    updates.date = body.date;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") return error("Description must be a string.");
    updates.description = body.description;
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" ? body.notes : null;
  }

  if (Object.keys(updates).length === 0) return error("No valid fields to update.");

  const result = await db
    .update(transfers)
    .set({ ...updates, updated_date: new Date().toISOString() })
    .where(and(eq(transfers.id, id), eq(transfers.created_by_id, user.id)))
    .returning();

  if (!result.length) return error("Transfer not found.", 404);
  return json(result[0]);
});
