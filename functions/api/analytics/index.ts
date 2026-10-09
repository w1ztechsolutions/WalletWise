import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { transactions, budgets } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

export const onRequestGet: PagesFunction<Env> = withErrorHandling(async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const db = createDb(context.env);
  const url = new URL(context.request.url);
  const view = url.searchParams.get("view") ?? "overview";

  // Date-window helpers shared by the ranged views below.
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const monthAt = (offsetFromNow: number): string => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - offsetFromNow, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const expandRange = (start: string, end: string, cap = 60): string[] => {
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    const out: string[] = [];
    let y = sy;
    let m = sm;
    while ((y < ey || (y === ey && m <= em)) && out.length < cap) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  };
  // `?months=N|all` or `?start=YYYY-MM&end=YYYY-MM`; defaults to 6.
  const resolveMonths = (): { months: string[] | null; start: string | null; end: string | null } => {
    const rawMonths = (url.searchParams.get("months") ?? "").trim().toLowerCase();
    const rawStart = (url.searchParams.get("start") ?? "").trim();
    const rawEnd = (url.searchParams.get("end") ?? "").trim();
    const validStart = MONTH_RE.test(rawStart) ? rawStart : null;
    const validEnd = MONTH_RE.test(rawEnd) ? rawEnd : null;
    if (validStart && validEnd) {
      const [s, e] = validStart <= validEnd ? [validStart, validEnd] : [validEnd, validStart];
      const months = expandRange(s, e);
      return { months, start: months[0] ?? s, end: months[months.length - 1] ?? e };
    }
    if (rawMonths === "all") return { months: null, start: null, end: null };
    let count = Number.parseInt(rawMonths, 10);
    if (!Number.isFinite(count)) count = 6;
    count = Math.min(60, Math.max(1, count));
    const months: string[] = [];
    for (let i = count - 1; i >= 0; i--) months.push(monthAt(i));
    return { months, start: months[0], end: months[months.length - 1] };
  };

  if (view === "overview") {
    // Current month stats
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [incomeResult, expenseResult] = await Promise.all([
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.created_by_id, user.id),
            eq(transactions.type, "income"),
            sql`substr(${transactions.date}, 1, 7) = ${currentMonth}`
          )
        ),
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.created_by_id, user.id),
            eq(transactions.type, "expense"),
            sql`substr(${transactions.date}, 1, 7) = ${currentMonth}`
          )
        ),
    ]);

    const income = Number(incomeResult[0]?.total ?? 0);
    const expenses = Number(expenseResult[0]?.total ?? 0);

    // Budgets for current month
    const monthBudgets = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.created_by_id, user.id), eq(budgets.month, currentMonth)));

    // Recent transactions
    const recentTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.created_by_id, user.id))
      .orderBy(desc(transactions.date))
      .limit(5);

    // Spending by category for current month
    const categorySpending = await db
      .select({
        category_name: transactions.category_name,
        total: sql`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.created_by_id, user.id),
          eq(transactions.type, "expense"),
          sql`substr(${transactions.date}, 1, 7) = ${currentMonth}`
        )
      )
      .groupBy(transactions.category_name);

    return json({
      month: currentMonth,
      income,
      expenses,
      netBalance: income - expenses,
      savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
      budgets: monthBudgets,
      recentTransactions,
      categorySpending,
    });
  }

  if (view === "monthly") {
    const { months, start, end } = resolveMonths();
    const monthExpr = sql`substr(${transactions.date}, 1, 7)`;
    const monthlyData = await db
      .select({
        month: monthExpr,
        type: transactions.type,
        total: sql`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        months
          ? and(eq(transactions.created_by_id, user.id), inArray(monthExpr, months))
          : eq(transactions.created_by_id, user.id)
      )
      .groupBy(monthExpr, transactions.type);

    const bucketMonths: string[] =
      months ?? [...new Set(monthlyData.map((d) => String(d.month)))].sort();

    const trend = bucketMonths.map((m) => {
      const income = Number(monthlyData.find((d) => d.month === m && d.type === "income")?.total ?? 0);
      const expenses = Number(monthlyData.find((d) => d.month === m && d.type === "expense")?.total ?? 0);
      return { month: m, income, expenses, net: income - expenses };
    });

    return json({ months: trend, start: start ?? bucketMonths[0] ?? null, end: end ?? bucketMonths[bucketMonths.length - 1] ?? null });
  }

  if (view === "all-time") {
    const { start, end } = resolveMonths();
    const hasRange = Boolean(start && end);
    // Builder-based scope: identity/typed filters are eq() terms; only the
    // date-window predicate (parameterized, MONTH_RE-validated inputs) stays
    // a sql fragment.
    const scopeFor = (type: "income" | "expense") => {
      const conditions = [eq(transactions.created_by_id, user.id), eq(transactions.type, type)];
      if (hasRange) {
        conditions.push(sql`substr(${transactions.date}, 1, 7) BETWEEN ${start} AND ${end}`);
      }
      return and(...conditions);
    };
    const [incomeResult, expenseResult] = await Promise.all([
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(scopeFor("income")),
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(scopeFor("expense")),
    ]);

    const totalIncome = Number(incomeResult[0]?.total ?? 0);
    const totalExpenses = Number(expenseResult[0]?.total ?? 0);

    const topCategories = await db
      .select({
        category_name: transactions.category_name,
        total: sql`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(scopeFor("expense"))
      .groupBy(transactions.category_name)
      .orderBy(desc(sql`SUM(${transactions.amount})`))
      .limit(5);

    return json({
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0,
      topCategories,
      start: hasRange ? start : null,
      end: hasRange ? end : null,
    });
  }

  return error("Unknown view. Use 'overview', 'monthly', or 'all-time'.", 400);
});
