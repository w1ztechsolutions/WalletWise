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

export interface AnalyticsRange {
  months?: number | "all";
  start?: string;
  end?: string;
}

export interface AnalyticsMonthly {
  months: { month: string; income: number; expenses: number; net: number }[];
  start?: string | null;
  end?: string | null;
}

export interface AnalyticsAllTime {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  savingsRate: number;
  topCategories: { category_name: string; total: number }[];
  start?: string | null;
  end?: string | null;
}

export const analyticsKeys = {
  all: (userId = "anonymous") => ["analytics", userId] as const,
  view: (view: AnalyticsView, range: AnalyticsRange | undefined, userId = "anonymous") =>
    [...analyticsKeys.all(userId), view, range ?? {}] as const,
};

/**
 * Wraps `GET /api/analytics?view=...`. Each view+range is cached separately so
 * the dashboard's month snapshot does not invalidate the analytics page's
 * filtered totals, and vice versa.
 *
 * The response shape depends on `view`, so the payload type is a parameter —
 * `useAnalytics<AnalyticsOverview>("overview")`.
 */
export function useAnalytics<T = AnalyticsOverview>(view: AnalyticsView, range?: AnalyticsRange) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  const params: Record<string, string> = { view };
  if (range?.months !== undefined) params.months = String(range.months);
  if (range?.start) params.start = range.start;
  if (range?.end) params.end = range.end;

  return useQuery({
    queryKey: analyticsKeys.view(view, range, userId),
    queryFn: () => apiFetch<T>("/analytics", { params }),
    retry: useRetry,
  });
}