import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { analyticsKeys } from "@/hooks/useAnalytics";
import { accountKeys } from "@/hooks/useAccounts";
import { useSession } from "@/hooks/useSession";
import type { Transaction } from "@/types";

export const transactionKeys = {
  all: (userId = "anonymous") => ["transactions", userId] as const,
  lists: (userId = "anonymous") => [...transactionKeys.all(userId), "list"] as const,
  filters: (filters?: TransactionFilters, userId = "anonymous") =>
    [...transactionKeys.lists(userId), filters ?? {}] as const,
  detail: (id: string, userId = "anonymous") => [...transactionKeys.all(userId), id] as const,
};

export interface TransactionFilters {
  type?: string;
  category_id?: string;
  month?: string;
  search?: string;
}

export function useTransactions(filters?: TransactionFilters) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: transactionKeys.filters(filters ?? {}, userId),
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
function invalidateAfterTransactionWrite(
  queryClient: ReturnType<typeof useQueryClient>,
  userId = "anonymous"
) {
  queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all(userId) });
  queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
}

export function useAddTransaction() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (data: Omit<Transaction, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterTransactionWrite(queryClient, userId),
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Transaction>) =>
      apiFetch<Transaction>(`/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterTransactionWrite(queryClient, userId),
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/transactions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateAfterTransactionWrite(queryClient, userId),
  });
}
