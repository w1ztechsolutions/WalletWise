import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Category } from "@/types";

export const categoryKeys = {
  all: ["categories"] as const,
  lists: () => [...categoryKeys.all, "list"] as const,
  byType: (type: string) => [...categoryKeys.lists(), { type }] as const,
  detail: (id: string) => [...categoryKeys.all, id] as const,
};

export function useCategories(type?: string) {
  return useQuery({
    queryKey: type ? categoryKeys.byType(type) : categoryKeys.lists(),
    queryFn: () =>
      apiFetch<Category[]>("/categories", {
        params: type ? { type } : undefined,
      }),
  });
}

export function useAddCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Category, "id" | "created_by_id" | "created_date" | "updated_date">) =>
      apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Category>) =>
      apiFetch<Category>(`/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/categories/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
}
