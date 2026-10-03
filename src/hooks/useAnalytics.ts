import { useQuery } from "@tanstack/react-query";
import { apiFetch, useRetry } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import type { Budget, Transaction } from "@/types";

export type AnalyticsView = "overview" | "monthly" | "all-time";

export interface AnalyticsOverview {
  month: string;
  income: number;
  expenses: number;
  netBalance: number;
  savingsRate: number;
  budgets: Budget[];
  recentTransactions: Transaction[];
  categorySpending: { category_name: string; total: number }[];
}

export interface AnalyticsMonthly {
  months: { month: string; income: number; expenses: number; net: number }[];
}

export interface AnalyticsAllTime {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  savingsRate: number;
  topCategories: { category_name: string; total: number }[];
}

export const analyticsKeys = {
  all: (userId = "anonymous") => ["analytics", userId] as const,
  view: (view: AnalyticsView, userId = "anonymous") => [...analyticsKeys.all(userId), view] as const,
};

/**
 * Wraps `GET /api/analytics?view=...`. Each view is cached separately so the
 * dashboard's month snapshot does not invalidate the analytics page's lifetime
 * totals, and vice versa.
 *
 * The response shape depends on `view`, so the payload type is a parameter —
 * `useAnalytics<AnalyticsOverview>("overview")`.
 */
export function useAnalytics<T = AnalyticsOverview>(view: AnalyticsView) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: analyticsKeys.view(view, userId),
    queryFn: () => apiFetch<T>("/analytics", { params: { view } }),
    retry: useRetry,
  });
}