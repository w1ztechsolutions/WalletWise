import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { analyticsKeys } from "@/hooks/useAnalytics";
import { useSession } from "@/hooks/useSession";
import type { Budget } from "@/types";

export const budgetKeys = {
  all: (userId = "anonymous") => ["budgets", userId] as const,
  lists: (userId = "anonymous") => [...budgetKeys.all(userId), "list"] as const,
  byMonth: (month: string, userId = "anonymous") => [...budgetKeys.lists(userId), { month }] as const,
  detail: (id: string, userId = "anonymous") => [...budgetKeys.all(userId), id] as const,
};

export function useBudgets(month?: string) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: month ? budgetKeys.byMonth(month, userId) : budgetKeys.lists(userId),
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
function invalidateAfterBudgetWrite(
  queryClient: ReturnType<typeof useQueryClient>,
  userId = "anonymous"
) {
  queryClient.invalidateQueries({ queryKey: budgetKeys.all(userId) });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all(userId) });
}

export function useAddBudget() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (data: Omit<Budget, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Budget>("/budgets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterBudgetWrite(queryClient, userId),
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Budget>) =>
      apiFetch<Budget>(`/budgets/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateAfterBudgetWrite(queryClient, userId),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/budgets/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateAfterBudgetWrite(queryClient, userId),
  });
}
