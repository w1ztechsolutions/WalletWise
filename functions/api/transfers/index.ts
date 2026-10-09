import { eq, and, desc } from "drizzle-orm";
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

function validateTransfer(body: Record<string, unknown>): { ok: true; value: { from_account_id: string; to_account_id: string; amount: number; date: string; description: string; notes: string | null } } | { ok: false; reason: string } {
  const { from_account_id, to_account_id, amount, date, description, notes } = body;
  if (typeof from_account_id !== "string" || !from_account_id.trim()) {
    return { ok: false, reason: "Source account is required." };
  }
  if (typeof to_account_id !== "string" || !to_account_id.trim()) {
    return { ok: false, reason: "Destination account is required." };
  }
  if (from_account_id.trim() === to_account_id.trim()) {
    return { ok: false, reason: "Source and destination accounts must differ." };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Amount must be a positive number." };
  }
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return { ok: false, reason: "Invalid date. Expected YYYY-MM-DD format." };
  }
  return {
    ok: true,
    value: {
      from_account_id: from_account_id.trim(),
      to_account_id: to_account_id.trim(),
      amount,
      date,
      description: typeof description === "string" ? description : "",
      notes: typeof notes === "string" ? notes : null,
    },
  };
}

async function assertOwned(db: ReturnType<typeof createDb>, userId: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.created_by_id, userId)))
    .limit(1);
  return Boolean(row);
}

export const onRequestGet: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const db = createDb(context.env);
  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.created_by_id, user.id))
    .orderBy(desc(transfers.date));

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

  const validated = validateTransfer(body);
  if (!validated.ok) return error(validated.reason);

  const db = createDb(context.env);
  const [fromOk, toOk] = await Promise.all([
    assertOwned(db, user.id, validated.value.from_account_id),
    assertOwned(db, user.id, validated.value.to_account_id),
  ]);
  if (!fromOk || !toOk) return error("Account not found.", 404);

  const id = crypto.randomUUID();
  const result = await db
    .insert(transfers)
    .values({ id, created_by_id: user.id, ...validated.value })
    .returning();

  return json(result[0], 201);
});
