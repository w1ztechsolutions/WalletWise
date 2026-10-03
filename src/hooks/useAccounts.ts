import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { transactionKeys } from "@/hooks/useTransactions";
import { useSession } from "@/hooks/useSession";
import type { Account } from "@/types";

export const accountKeys = {
  all: (userId = "anonymous") => ["accounts", userId] as const,
  lists: (userId = "anonymous") => [...accountKeys.all(userId), "list"] as const,
  detail: (id: string, userId = "anonymous") => [...accountKeys.all(userId), id] as const,
};

export function useAccounts() {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: accountKeys.lists(userId),
    queryFn: () => apiFetch<Account[]>("/accounts"),
    retry: useRetry,
  });
}

export function useAddAccount() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (data: Omit<Account, "id" | "created_by_id" | "created_date" | "updated_date" | "balance">) =>
      apiFetch<Account>("/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Omit<Account, "balance">>) =>
      apiFetch<Account>(`/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/accounts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}
