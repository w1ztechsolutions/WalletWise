import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
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
  });
}

export function useAddBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Budget, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Budget>("/budgets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/budgets/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}
