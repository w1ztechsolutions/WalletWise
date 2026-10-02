import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
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
  });
}

export function useAddTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Transaction, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/transactions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    },
  });
}
