import { eq } from "drizzle-orm";
import { accounts } from "../../../src/db/schema";
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

  const db = createDb(context.env);
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.created_by_id, user.id));

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

  const { name, type, institution, account_number, balance, color, notes } = body;

  if (typeof name !== "string" || !name.trim()) {
    return error("Account name is required.");
  }
  if (typeof type !== "string" || !["cash", "bank", "mobile_wallet"].includes(type)) {
    return error("Type must be 'cash', 'bank', or 'mobile_wallet'.");
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
      account_number: typeof account_number === "string" ? account_number : "",
      balance: typeof balance === "number" ? balance : 0,
      color: typeof color === "string" ? color : "#3b82f6",
      notes: typeof notes === "string" ? notes : null,
    })
    .returning();

  return json(result[0], 201);
});
