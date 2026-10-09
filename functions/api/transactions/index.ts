import { eq, and, desc, sql } from "drizzle-orm";
import { transactions, accounts } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error, getOwnedCategoryIds } from "../../lib/helpers";
import { validateTransactionRow, validateAttachment } from "../../lib/validation";
import { withErrorHandling } from "../../lib/errors";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

/**
 * SEC-06 — escapes LIKE wildcards in untrusted filter input so the value
 * matches literally instead of acting as a pattern. Always paired with
 * `ESCAPE '\'` at the call site.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const onRequestGet: PagesFunction<Env> = withErrorHandling(async (context) => {
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
    conditions.push(sql`${transactions.date} LIKE ${escapeLikePattern(month) + "%"} ESCAPE '\\'`);
  }
  if (search) {
    conditions.push(
      sql`${transactions.description} LIKE ${"%" + escapeLikePattern(search) + "%"} ESCAPE '\\'`
    );
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const rows = await db
    .select()
    .from(transactions)
    .where(whereClause)
    .orderBy(desc(transactions.date));

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

  const validated = validateTransactionRow(body);
  if (!validated.ok) {
    return error(validated.reason);
  }

  const db = createDb(context.env);
  if (validated.value.account_id) {
    const [ownedAccount] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, validated.value.account_id), eq(accounts.created_by_id, user.id)))
      .limit(1);
    if (!ownedAccount) return error("Account not found.", 404);
  }
  // SEC-04 — category references are as untrusted as account references;
  // a foreign id must look exactly like a missing one (404, no enumeration).
  if (validated.value.category_id) {
    const ownedCategories = await getOwnedCategoryIds(context.env, user.id, [
      validated.value.category_id,
    ]);
    if (!ownedCategories.has(validated.value.category_id)) {
      return error("Category not found.", 404);
    }
  }
  // DOC-04 — persist receipt attachment fields only after the same
  // structural + ownership checks the storage endpoints enforce.
  const attachment = validateAttachment(body, user.id);
  if (!attachment.ok) return error(attachment.reason);

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
      account_id: validated.value.account_id,
      category_name: validated.value.category_name,
      type: validated.value.type,
      is_recurring: validated.value.is_recurring,
      notes: validated.value.notes,
      attachment_key: attachment.value.key,
      attachment_name: attachment.value.name,
    })
    .returning();

  return json(result[0], 201);
});
