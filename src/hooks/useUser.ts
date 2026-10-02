import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { User } from "@/types";

export const userKeys = {
  all: ["user"] as const,
  profile: () => [...userKeys.all, "profile"] as const,
};

export function useUser() {
  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: () => apiFetch<User>("/user/me"),
    retry: false,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) =>
      apiFetch<User>("/user/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
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
