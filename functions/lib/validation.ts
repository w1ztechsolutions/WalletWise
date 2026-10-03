/**
 * Row validation shared by the single-record endpoints and the bulk import
 * pipeline.
 *
 * This module exists so `POST /api/transactions` and `POST /api/import` cannot
 * drift apart: a row rejected by the import preview would have to be rejected by
 * single-create too, and vice versa. Both call the functions below.
 */

export interface ValidatedTransaction {
  date: string;
  amount: number;
  description: string;
  category_id: string | null;
  account_id: string | null;
  category_name: string;
  type: "income" | "expense";
  is_recurring: boolean;
  notes: string | null;
}

export interface ValidatedBudget {
  month: string;
  category_id: string | null;
  category_name: string;
  planned_amount: number;
  notes: string | null;
}

/** Returns an error message, or `null` when the row is acceptable. */
export function validateTransactionRow(
  row: Record<string, unknown>
): { ok: true; value: ValidatedTransaction } | { ok: false; reason: string } {
  const { date, amount, description, category_id, account_id, category_name, type, is_recurring, notes } = row;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: "Invalid date. Expected YYYY-MM-DD format." };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Amount must be a positive number." };
  }
  if (typeof type !== "string" || !["income", "expense"].includes(type)) {
    return { ok: false, reason: "Type must be 'income' or 'expense'." };
  }
  if (typeof category_name !== "string" || !category_name.trim()) {
    return { ok: false, reason: "Category name is required." };
  }
  if (account_id !== undefined && account_id !== null && typeof account_id !== "string") {
    return { ok: false, reason: "Account must be a valid account ID." };
  }

  return {
    ok: true,
    value: {
      date,
      amount,
      description: typeof description === "string" ? description : "",
      category_id: typeof category_id === "string" ? category_id : null,
      account_id: typeof account_id === "string" && account_id.trim() ? account_id.trim() : null,
      category_name: category_name.trim(),
      type: type as "income" | "expense",
      is_recurring: typeof is_recurring === "boolean" ? is_recurring : false,
      notes: typeof notes === "string" ? notes : null,
    },
  };
}

export function validateBudgetRow(
  row: Record<string, unknown>
): { ok: true; value: ValidatedBudget } | { ok: false; reason: string } {
  const { month, category_id, category_name, planned_amount, notes } = row;

  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, reason: "Invalid month. Expected YYYY-MM format." };
  }
  if (typeof planned_amount !== "number" || !Number.isFinite(planned_amount) || planned_amount <= 0) {
    return { ok: false, reason: "Planned amount must be a positive number." };
  }
  if (typeof category_name !== "string" || !category_name.trim()) {
    return { ok: false, reason: "Category name is required." };
  }

  return {
    ok: true,
    value: {
      month,
      category_id: typeof category_id === "string" ? category_id : null,
      category_name: category_name.trim(),
      planned_amount,
      notes: typeof notes === "string" ? notes : null,
    },
  };
}

/**
 * Duplicate identity for a transaction (decision D3):
 * `created_by_id + date + amount + type + category_id + lower(trim(description))`.
 *
 * Amount is normalised to 2 decimals so `850` and `850.00` collide, which is
 * what a spreadsheet produces routinely.
 */
export function transactionRowKey(
  userId: string,
  row: ValidatedTransaction
): string {
  const description = row.description.trim().toLowerCase();
  return [
    "tx",
    userId,
    row.date,
    row.amount.toFixed(2),
    row.type,
    row.category_id ?? "",
    description,
  ].join("|");
}

/** Duplicate identity for a budget: the existing unique index `(user, month, category)`. */
export function budgetRowKey(userId: string, row: ValidatedBudget): string {
  return ["bg", userId, row.month, row.category_id ?? ""].join("|");
}