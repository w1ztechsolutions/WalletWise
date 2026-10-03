import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import type { Category } from "@/types";

export const categoryKeys = {
  all: (userId = "anonymous") => ["categories", userId] as const,
  lists: (userId = "anonymous") => [...categoryKeys.all(userId), "list"] as const,
  byType: (type: string, userId = "anonymous") => [...categoryKeys.lists(userId), { type }] as const,
  detail: (id: string, userId = "anonymous") => [...categoryKeys.all(userId), id] as const,
};

export function useCategories(type?: string) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: type ? categoryKeys.byType(type, userId) : categoryKeys.lists(userId),
    queryFn: () =>
      apiFetch<Category[]>("/categories", {
        params: type ? { type } : undefined,
      }),
    retry: useRetry,
  });
}

export function useAddCategory() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (data: Omit<Category, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(userId) });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Category>) =>
      apiFetch<Category>(`/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(userId) });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/categories/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(userId) });
    },
  });
}
