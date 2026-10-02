import { eq, sql } from "drizzle-orm";
import { transactions, budgets, categories } from "../../../src/db/schema";
import { createDb, getAuthUser, json, error } from "../../lib/helpers";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);

  const db = createDb(context.env);
  const url = new URL(context.request.url);
  const view = url.searchParams.get("view") ?? "overview";

  if (view === "overview") {
    // Current month stats
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [incomeResult, expenseResult] = await Promise.all([
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(
          sql`${transactions.created_by_id} = ${user.id} AND ${transactions.type} = 'income' AND substr(${transactions.date}, 1, 7) = ${currentMonth}`
        ),
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(
          sql`${transactions.created_by_id} = ${user.id} AND ${transactions.type} = 'expense' AND substr(${transactions.date}, 1, 7) = ${currentMonth}`
        ),
    ]);

    const income = Number(incomeResult[0]?.total ?? 0);
    const expenses = Number(expenseResult[0]?.total ?? 0);

    // Budgets for current month
    const monthBudgets = await db
      .select()
      .from(budgets)
      .where(
        sql`${budgets.created_by_id} = ${user.id} AND ${budgets.month} = ${currentMonth}`
      );

    // Recent transactions
    const recentTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.created_by_id, user.id))
      .orderBy(sql`${transactions.date} DESC`)
      .limit(5);

    // Spending by category for current month
    const categorySpending = await db
      .select({
        category_name: transactions.category_name,
        total: sql`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.created_by_id} = ${user.id} AND ${transactions.type} = 'expense' AND substr(${transactions.date}, 1, 7) = ${currentMonth}`
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
    // 6-month trend
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const monthlyData = await db
      .select({
        month: sql`substr(${transactions.date}, 1, 7)`,
        type: transactions.type,
        total: sql`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.created_by_id} = ${user.id} AND substr(${transactions.date}, 1, 7) IN (${months.map((m) => `'${m}'`).join(", ")})`
      )
      .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type);

    const trend = months.map((m) => {
      const income = Number(monthlyData.find((d) => d.month === m && d.type === "income")?.total ?? 0);
      const expenses = Number(monthlyData.find((d) => d.month === m && d.type === "expense")?.total ?? 0);
      return { month: m, income, expenses, net: income - expenses };
    });

    return json({ months: trend });
  }

  if (view === "all-time") {
    const [incomeResult, expenseResult] = await Promise.all([
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(sql`${transactions.created_by_id} = ${user.id} AND ${transactions.type} = 'income'`),
      db
        .select({ total: sql`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(sql`${transactions.created_by_id} = ${user.id} AND ${transactions.type} = 'expense'`),
    ]);

    const totalIncome = Number(incomeResult[0]?.total ?? 0);
    const totalExpenses = Number(expenseResult[0]?.total ?? 0);

    const topCategories = await db
      .select({
        category_name: transactions.category_name,
        total: sql`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(sql`${transactions.created_by_id} = ${user.id} AND ${transactions.type} = 'expense'`)
      .groupBy(transactions.category_name)
      .orderBy(sql`SUM(${transactions.amount}) DESC`)
      .limit(5);

    return json({
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0,
      topCategories,
    });
  }

  return error("Unknown view. Use 'overview', 'monthly', or 'all-time'.", 400);
};
