import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { userKeys } from "@/hooks/useUser";
import type { User } from "@/types";

interface AccountDeletionResult {
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
}

function updateDeletionState(queryClient: ReturnType<typeof useQueryClient>, state: AccountDeletionResult) {
  queryClient.setQueryData<User>(userKeys.profile(), (current) =>
    current ? { ...current, ...state } : current
  );
}

export function useScheduleAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AccountDeletionResult>("/user/account-deletion", {
        method: "POST",
        body: JSON.stringify({ action: "schedule", confirmation: "DELETE" }),
      }),
    onSuccess: (state) => updateDeletionState(queryClient, state),
  });
}

export function useRestoreAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AccountDeletionResult>("/user/account-deletion", {
        method: "POST",
        body: JSON.stringify({ action: "restore" }),
      }),
    onSuccess: (state) => {
      updateDeletionState(queryClient, state);
      void queryClient.invalidateQueries();
    },
  });
}