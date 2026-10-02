import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { transactionKeys } from "@/hooks/useTransactions";
import { budgetKeys } from "@/hooks/useBudgets";
import { analyticsKeys } from "@/hooks/useAnalytics";
import type { Budget, Transaction } from "@/types";

/** Rows as the client sends them — pre-validation, straight off the parser. */
export type ImportTransactionRow = Omit<
  Transaction,
  "id" | "created_by_id" | "created_date" | "updated_date"
>;
export type ImportBudgetRow = Omit<Budget, "id" | "created_by_id" | "created_date" | "updated_date">;

export interface ImportPayload {
  transactions: ImportTransactionRow[];
  budgets: ImportBudgetRow[];
}

export interface ImportDuplicate<T> {
  /** Server-derived identity of the row; echo this back to skip or replace it. */
  key: string;
  incoming: T;
  existing: Record<string, unknown>;
}

export interface ImportPreview {
  inserted: { transactions: number; budgets: number };
  duplicates: {
    transactions: ImportDuplicate<ImportTransactionRow>[];
    budgets: ImportDuplicate<ImportBudgetRow>[];
  };
  invalid: { row: Record<string, unknown>; entity: "transaction" | "budget"; reason: string }[];
}

export interface ImportCommitResult {
  inserted: { transactions: number; budgets: number };
  replaced: { transactions: number; budgets: number };
  skipped: number;
  invalid: { row: Record<string, unknown>; entity: "transaction" | "budget"; reason: string }[];
}

export type DuplicateDecision = "skip" | "replace";

export function useBulkImport() {
  const queryClient = useQueryClient();

  /**
   * Phase 1 — classify without writing. Nothing reaches D1 until `commitImport`
   * runs, so a user who abandons the review modal leaves no partial import.
   */
  const previewImport = useMutation({
    mutationFn: (payload: ImportPayload) =>
      apiFetch<ImportPreview>("/import", {
        method: "POST",
        params: { mode: "preview" },
        body: JSON.stringify(payload),
      }),
  });

  /** Phase 2 — apply the review. Invalid rows are skipped, not fatal. */
  const commitImport = useMutation({
    mutationFn: (input: ImportPayload & { decisions: Record<string, DuplicateDecision> }) => {
      const skip = Object.entries(input.decisions)
        .filter(([, decision]) => decision === "skip")
        .map(([key]) => key);
      const replace = Object.entries(input.decisions)
        .filter(([, decision]) => decision === "replace")
        .map(([key]) => key);

      return apiFetch<ImportCommitResult>("/import", {
        method: "POST",
        params: { mode: "commit" },
        body: JSON.stringify({
          transactions: input.transactions,
          budgets: input.budgets,
          skip,
          replace,
        }),
      });
    },
    onSuccess: () => {
      // Import rewrites both collections, and the dashboard/analytics figures are
      // derived from them — invalidating only transactions would leave stale totals.
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
    },
  });

  return {
    previewImport: previewImport.mutate,
    previewImportAsync: previewImport.mutateAsync,
    commitImport: commitImport.mutate,
    isPreviewing: previewImport.isPending,
    isCommitting: commitImport.isPending,
  };
}