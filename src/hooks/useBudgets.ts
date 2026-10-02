import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { analyticsKeys } from "@/hooks/useAnalytics";
import type { Budget } from "@/types";

export const budgetKeys = {
  all: ["budgets"] as const,
  lists: () => [...budgetKeys.all, "list"] as const,
  byMonth: (month: string) => [...budgetKeys.lists(), { month }] as const,
  detail: (id: string) => [...budgetKeys.all, id] as const,
};

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: month ? budgetKeys.byMonth(month) : budgetKeys.lists(),
    queryFn: () =>
      apiFetch<Budget[]>("/budgets", {
        params: month ? { month } : undefined,
      }),
    retry: useRetry,
  });
}

/**
 * The dashboard's `overview` payload embeds the current month's budgets, so a
 * budget write has to invalidate analytics as well as the budget list.
 */
function invalidateAfterBudgetWrite(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: budgetKeys.all });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
}

export function useAddBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Budget, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Budget>("/budgets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterBudgetWrite(queryClient),
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Budget>) =>
      apiFetch<Budget>(`/budgets/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterBudgetWrite(queryClient),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/budgets/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateAfterBudgetWrite(queryClient),
  });
}
