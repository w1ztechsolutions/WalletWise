import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { userKeys } from "@/hooks/useUser";
import type { User } from "@/types";

interface AccountDeletionResult {
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
}

function updateDeletionState(
  queryClient: ReturnType<typeof useQueryClient>,
  state: AccountDeletionResult,
  userId = "anonymous"
) {
  queryClient.setQueryData<User>(userKeys.profile(userId), (current) =>
    current ? { ...current, ...state } : current
  );
}

export function useScheduleAccountDeletion() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: () =>
      apiFetch<AccountDeletionResult>("/user/account-deletion", {
        method: "POST",
        body: JSON.stringify({ action: "schedule", confirmation: "DELETE" }),
      }),
    onSuccess: (state) => updateDeletionState(queryClient, state, userId),
  });
}

export function useRestoreAccount() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: () =>
      apiFetch<AccountDeletionResult>("/user/account-deletion", {
        method: "POST",
        body: JSON.stringify({ action: "restore" }),
      }),
    onSuccess: (state) => {
      updateDeletionState(queryClient, state, userId);
      void queryClient.invalidateQueries({ queryKey: userKeys.all(userId) });
    },
  });
}