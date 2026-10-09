import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { accountKeys } from "@/hooks/useAccounts";
import { useSession } from "@/hooks/useSession";
import type { Transfer } from "@/types";

export const transferKeys = {
  all: (userId = "anonymous") => ["transfers", userId] as const,
  lists: (userId = "anonymous") => [...transferKeys.all(userId), "list"] as const,
};

export function useTransfers() {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: transferKeys.lists(userId),
    queryFn: () => apiFetch<Transfer[]>("/transfers"),
    retry: useRetry,
  });
}

export function useAddTransfer() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (data: Omit<Transfer, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Transfer>("/transfers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // Balances are derived server-side from transfers, so both caches refresh.
      queryClient.invalidateQueries({ queryKey: transferKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
    },
  });
}

export function useUpdateTransfer() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Transfer>) =>
      apiFetch<Transfer>(`/transfers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
    },
  });
}

export function useDeleteTransfer() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/transfers/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.all(userId) });
      queryClient.invalidateQueries({ queryKey: accountKeys.all(userId) });
    },
  });
}
