import { and, eq, inArray } from "drizzle-orm";
import { transactions, budgets } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";
import {
  validateTransactionRow,
  validateBudgetRow,
  transactionRowKey,
  budgetRowKey,
  type ValidatedTransaction,
  type ValidatedBudget,
} from "../../lib/validation";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

/** Rows are written in chunks so a wide sheet cannot exhaust D1's per-request query budget. */
const COMMIT_CHUNK_SIZE = 50;

/** Preview is a read-only classification pass; refuse payloads large enough to time out. */
const MAX_PREVIEW_ROWS = 5000;

interface ImportRowError {
  row: Record<string, unknown>;
  entity: "transaction" | "budget";
  reason: string;
  /** Row identity, so the review UI can point at the offending line. */
  key: string;
}

interface DuplicateMatch<TIncoming, TExisting> {
  key: string;
  incoming: TIncoming;
  existing: TExisting;
}

interface PreviewResponse {
  inserted: { transactions: number; budgets: number };
  duplicates: {
    transactions: DuplicateMatch<ValidatedTransaction, Record<string, unknown>>[];
    budgets: DuplicateMatch<ValidatedBudget, Record<string, unknown>>[];
  };
  invalid: ImportRowError[];
}

interface CommitRequest {
  transactions?: Record<string, unknown>[];
  budgets?: Record<string, unknown>[];
  /** Row keys the user chose not to import. */
  skip?: string[];
  /** Row keys to write over the matched existing row, in place. */
  replace?: string[];
}

interface CommitResponse {
  inserted: { transactions: number; budgets: number };
  replaced: { transactions: number; budgets: number };
  skipped: number;
  invalid: ImportRowError[];
}

const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const asKeys = (value: unknown): Set<string> =>
  new Set(Array.isArray(value) ? value.filter((k): k is string => typeof k === "string") : []);

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Bulk spreadsheet import, two-phase by design.
 *
 * `?mode=preview` validates and classifies every row without writing anything, so
 * the user can review duplicates before anything touches D1. `?mode=commit`
 * applies the decisions made in that review.
 *
 * Duplicates are matched per decision D3 — see `functions/lib/validation.ts`.
 * Every classification key is derived server-side from the row itself, so the
 * keys the client echoes back in `skip`/`replace` cannot be forged to target
 * another user's row: the lookups are always scoped to the caller's id.
 */
export const onRequestPost: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(context.request.url);
  const mode = url.searchParams.get("mode") ?? "preview";

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const rawTransactions = asRows(body.transactions);
  const rawBudgets = asRows(body.budgets);

  if (rawTransactions.length + rawBudgets.length > MAX_PREVIEW_ROWS) {
    return error(
      `Import is limited to ${MAX_PREVIEW_ROWS} rows per file. Split the spreadsheet and retry.`,
      413
    );
  }

  // ---- Classify every row once; both modes share this step. ----
  const validTransactions: { row: ValidatedTransaction; key: string }[] = [];
  const validBudgets: { row: ValidatedBudget; key: string }[] = [];
  const invalid: ImportRowError[] = [];

  rawTransactions.forEach((raw) => {
    const result = validateTransactionRow(raw);
    if (result.ok) {
      validTransactions.push({ row: result.value, key: transactionRowKey(user.id, result.value) });
    } else {
      invalid.push({ row: raw, entity: "transaction", reason: result.reason, key: "" });
    }
  });

  rawBudgets.forEach((raw) => {
    const result = validateBudgetRow(raw);
    if (result.ok) {
      validBudgets.push({ row: result.value, key: budgetRowKey(user.id, result.value) });
    } else {
      invalid.push({ row: raw, entity: "budget", reason: result.reason, key: "" });
    }
  });

  // ---- Look up existing rows that collide with the incoming keys. ----
  const db = createDb(context.env);

  const existingTransactionsByKey = new Map<string, Record<string, unknown>>();
  if (validTransactions.length > 0) {
    const keysByIdentity = new Map<string, string>();
    for (const { key } of validTransactions) {
      keysByIdentity.set(key, key);
    }

    // Narrow the query by date (the one identity column that is cheap to filter
    // in SQL), then match the remaining identity columns in JS — the key
    // includes a normalised amount and a lowercased description, which SQLite
    // cannot reproduce reliably through drizzle's column helpers.
    const dates = [...new Set(validTransactions.map((t) => t.row.date))];
    const found = await db
      .select()
      .from(transactions)
      .where(
        dates.length > 0
          ? and(eq(transactions.created_by_id, user.id), inArray(transactions.date, dates))
          : eq(transactions.created_by_id, user.id)
      );

    for (const row of found) {
      const identity = transactionRowKey(user.id, {
        date: String(row.date),
        amount: Number(row.amount),
        description: String(row.description ?? ""),
        category_id: row.category_id ?? null,
        category_name: String(row.category_name ?? ""),
        type: row.type,
        is_recurring: Boolean(row.is_recurring),
        notes: row.notes ?? null,
      });
      if (keysByIdentity.has(identity)) {
        existingTransactionsByKey.set(identity, row as Record<string, unknown>);
      }
    }
  }

  const existingBudgetsByKey = new Map<string, Record<string, unknown>>();
  if (validBudgets.length > 0) {
    const keysByIdentity = new Map(validBudgets.map(({ key }) => [key, key]));
    const months = [...new Set(validBudgets.map((b) => b.row.month))];
    const found = await db
      .select()
      .from(budgets)
      .where(
        months.length > 0
          ? and(eq(budgets.created_by_id, user.id), inArray(budgets.month, months))
          : eq(budgets.created_by_id, user.id)
      );

    for (const row of found) {
      const identity = budgetRowKey(user.id, {
        month: String(row.month),
        category_id: row.category_id ?? null,
        category_name: String(row.category_name ?? ""),
        planned_amount: Number(row.planned_amount),
        notes: row.notes ?? null,
      });
      if (keysByIdentity.has(identity)) {
        existingBudgetsByKey.set(identity, row as Record<string, unknown>);
      }
    }
  }

  // ---- Preview: report only, write nothing. ----
  if (mode === "preview") {
    const duplicateTransactions: DuplicateMatch<
      ValidatedTransaction,
      Record<string, unknown>
    >[] = [];
    const duplicateBudgets: DuplicateMatch<ValidatedBudget, Record<string, unknown>>[] = [];

    // A key repeated *within* the same file is also a duplicate — the second
    // occurrence would otherwise insert and collide with the first.
    const seenTx = new Set<string>();
    const seenBg = new Set<string>();
    let insertedTx = 0;
    let insertedBg = 0;

    for (const { row, key } of validTransactions) {
      const existing = existingTransactionsByKey.get(key);
      if (existing) {
        duplicateTransactions.push({ key, incoming: row, existing });
      } else if (seenTx.has(key)) {
        duplicateTransactions.push({ key, incoming: row, existing: { ...row, id: "(earlier row in this file)" } });
      } else {
        seenTx.add(key);
        insertedTx += 1;
      }
    }

    for (const { row, key } of validBudgets) {
      const existing = existingBudgetsByKey.get(key);
      if (existing) {
        duplicateBudgets.push({ key, incoming: row, existing });
      } else if (seenBg.has(key)) {
        duplicateBudgets.push({ key, incoming: row, existing: { ...row, id: "(earlier row in this file)" } });
      } else {
        seenBg.add(key);
        insertedBg += 1;
      }
    }

    const response: PreviewResponse = {
      inserted: { transactions: insertedTx, budgets: insertedBg },
      duplicates: { transactions: duplicateTransactions, budgets: duplicateBudgets },
      invalid,
    };
    return json(response);
  }

  if (mode !== "commit") {
    return error("Unknown mode. Use 'preview' or 'commit'.");
  }

  // ---- Commit: apply the review decisions. ----
  const request = body as CommitRequest;
  const skip = asKeys(request.skip);
  const replace = asKeys(request.replace);

  const txInserts: Record<string, unknown>[] = [];
  const budgetInserts: Record<string, unknown>[] = [];
  const txReplacements: { key: string; existing: Record<string, unknown>; row: ValidatedTransaction }[] = [];
  const budgetReplacements: {
    key: string;
    existing: Record<string, unknown>;
    row: ValidatedBudget;
  }[] = [];
  let skipped = 0;

  for (const { row, key } of validTransactions) {
    if (skip.has(key)) {
      skipped += 1;
      continue;
    }
    const existing = existingTransactionsByKey.get(key);
    if (replace.has(key) && existing) {
      txReplacements.push({ key, existing, row });
    } else if (!existing) {
      txInserts.push({ id: crypto.randomUUID(), created_by_id: user.id, ...row });
    } else {
      // Duplicate with neither skip nor replace — default to not touching it.
      skipped += 1;
    }
  }

  for (const { row, key } of validBudgets) {
    if (skip.has(key)) {
      skipped += 1;
      continue;
    }
    const existing = existingBudgetsByKey.get(key);
    if (replace.has(key) && existing) {
      budgetReplacements.push({ key, existing, row });
    } else if (!existing) {
      budgetInserts.push({ id: crypto.randomUUID(), created_by_id: user.id, ...row });
    } else {
      skipped += 1;
    }
  }

  for (const group of chunk(txInserts, COMMIT_CHUNK_SIZE)) {
    await db.insert(transactions).values(group as never);
  }
  for (const group of chunk(budgetInserts, COMMIT_CHUNK_SIZE)) {
    await db.insert(budgets).values(group as never);
  }

  // Replace updates in place, keeping the existing id so nothing that already
  // references the row is orphaned.
  const stamp = new Date().toISOString();
  for (const { existing, row } of txReplacements) {
    await db
      .update(transactions)
      .set({ ...row, updated_date: stamp })
      .where(
        eq(transactions.id, String(existing.id)) // scoped by id resolved from the caller's own rows
      );
  }
  for (const { existing, row } of budgetReplacements) {
    await db
      .update(budgets)
      .set({ ...row, updated_date: stamp })
      .where(eq(budgets.id, String(existing.id)));
  }

  const response: CommitResponse = {
    inserted: { transactions: txInserts.length, budgets: budgetInserts.length },
    replaced: { transactions: txReplacements.length, budgets: budgetReplacements.length },
    skipped,
    invalid,
  };
  return json(response);
});
