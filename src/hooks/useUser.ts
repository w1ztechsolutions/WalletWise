import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import type { User } from "@/types";

export const userKeys = {
  all: (userId = "anonymous") => ["user", userId] as const,
  profile: (userId = "anonymous") => [...userKeys.all(userId), "profile"] as const,
};

export function useUser() {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: userKeys.profile(userId),
    queryFn: () => apiFetch<User>("/user/me"),
    retry: false,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (data: Partial<User>) =>
      apiFetch<User>("/user/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all(userId) });
    },
  });
}

/**
 * The active user's ISO currency code, e.g. `MWK`.
 *
 * Every `formatCurrency` call site needs this, otherwise the Phase 6.1
 * preference is silently inert and all views keep formatting in the default
 * currency. Falls back to `MWK` until `/user/me` resolves.
 */
export function useCurrency(): string {
  const { data } = useUser();
  return data?.currency ?? "MWK";
}
