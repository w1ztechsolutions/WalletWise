import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { analyticsKeys } from "@/hooks/useAnalytics";
import { accountKeys } from "@/hooks/useAccounts";
import type { Transaction } from "@/types";

export const transactionKeys = {
  all: ["transactions"] as const,
  lists: () => [...transactionKeys.all, "list"] as const,
  filters: (filters?: TransactionFilters) =>
    [...transactionKeys.lists(), filters ?? {}] as const,
  detail: (id: string) => [...transactionKeys.all, id] as const,
};

export interface TransactionFilters {
  type?: string;
  category_id?: string;
  month?: string;
  search?: string;
}

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: transactionKeys.filters(filters ?? {}),
    queryFn: () =>
      apiFetch<Transaction[]>("/transactions", {
        params: filters
          ? Object.fromEntries(
              Object.entries(filters).filter(
                ([, v]) => v !== undefined && v !== ""
              ) as [string, string][]
            )
          : undefined,
      }),
    retry: useRetry,
  });
}

/**
 * A transaction write changes more than the list: the dashboard's month
 * snapshot and the analytics page's lifetime totals are all derived from the
 * same rows on the server. Invalidating only `transactions` would leave those
 * screens showing pre-write numbers until a manual reload.
 */
function invalidateAfterTransactionWrite(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
  queryClient.invalidateQueries({ queryKey: accountKeys.all });
}

export function useAddTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Transaction, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterTransactionWrite(queryClient),
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Transaction>) =>
      apiFetch<Transaction>(`/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterTransactionWrite(queryClient),
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/transactions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateAfterTransactionWrite(queryClient),
  });
}
