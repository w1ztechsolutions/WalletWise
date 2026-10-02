import React, { useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  ChevronRight,
  PlusCircle,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency, formatDate, getCurrentMonth } from '@/lib/utils'

interface DashboardViewProps {
  onNavigateTab: (tab: any) => void
  onOpenAddTransaction: () => void
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab, onOpenAddTransaction }) => {
  const { transactions, budgets, categories } = useFinance()
  const currentMonth = getCurrentMonth()

  // 1. Current month filtered transactions
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => t.date.startsWith(currentMonth))
  }, [transactions, currentMonth])

  // 2. Stat calculations
  const stats = useMemo(() => {
    let income = 0
    let expenses = 0

    monthTransactions.forEach((t) => {
      if (t.type === 'income') income += t.amount
      else expenses += t.amount
    })

    const netBalance = income - expenses
    const savingsRate = income > 0 ? Math.max(0, Math.round(((income - expenses) / income) * 100)) : 0

    // Top category spending
    const expenseByCat: Record<string, number> = {}
    monthTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        expenseByCat[t.category_name] = (expenseByCat[t.category_name] || 0) + t.amount
      })

    let topCategory = { name: 'None', amount: 0 }
    Object.entries(expenseByCat).forEach(([name, amt]) => {
      if (amt > topCategory.amount) {
        topCategory = { name, amount: amt }
      }
    })

    // Budget Score (0-100): baseline 100, penalized if expenses exceed planned budgets or income
    let totalPlanned = 0
    const currentMonthBudgets = budgets.filter((b) => b.month === currentMonth)
    currentMonthBudgets.forEach((b) => (totalPlanned += b.planned_amount))

    let budgetScore = 85
    if (totalPlanned > 0) {
      const ratio = expenses / totalPlanned
      if (ratio <= 0.8) budgetScore = 95
      else if (ratio <= 1.0) budgetScore = 80
      else budgetScore = Math.max(20, Math.round(80 - (ratio - 1) * 60))
    } else if (income > 0) {
      budgetScore = Math.min(100, Math.max(30, Math.round((netBalance / income) * 100)))
    }

    return { income, expenses, netBalance, savingsRate, budgetScore, topCategory }
  }, [monthTransactions, budgets, currentMonth])

  // 3. Category Donut Data
  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>()
    monthTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const cat = categories.find((c) => c.id === t.category_id)
        const color = cat?.color || '#6366f1'
        const existing = map.get(t.category_name)
        if (existing) {
          existing.value += t.amount
        } else {
          map.set(t.category_name, { name: t.category_name, value: t.amount, color })
        }
      })
    return Array.from(map.values())
  }, [monthTransactions, categories])

  // 4. 6-Month Income vs Expenses Bar Chart Data
  const monthlyTrendData = useMemo(() => {
    const result: { month: string; Income: number; Expenses: number }[] = []
    const now = new Date()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('en-US', { month: 'short' })

      let mIncome = 0
      let mExpense = 0

      transactions.forEach((t) => {
        if (t.date.startsWith(monthStr)) {
          if (t.type === 'income') mIncome += t.amount
          else mExpense += t.amount
        }
      })

      result.push({
        month: label,
        Income: mIncome,
        Expenses: mExpense,
      })
    }
    return result
  }, [transactions])

  // 5. Budget vs Actual Progress
  const budgetProgress = useMemo(() => {
    const currentMonthBudgets = budgets.filter((b) => b.month === currentMonth)
    return currentMonthBudgets.map((b) => {
      const actual = monthTransactions
        .filter((t) => t.type === 'expense' && t.category_id === b.category_id)
        .reduce((sum, t) => sum + t.amount, 0)
      const cat = categories.find((c) => c.id === b.category_id)
      const percentage = b.planned_amount > 0 ? Math.round((actual / b.planned_amount) * 100) : 0
      return {
        ...b,
        actual,
        percentage,
        color: cat?.color || '#6366f1',
        isOverBudget: actual > b.planned_amount,
      }
    })
  }, [budgets, monthTransactions, categories, currentMonth])

  // 6. Recent 5 Transactions
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
  }, [transactions])

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Net Balance */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
              Net Balance
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-xl sm:text-2xl font-bold mt-2 tracking-tight ${stats.netBalance >= 0 ? 'text-slate-900 dark:text-slate-50' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(stats.netBalance)}
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>{stats.savingsRate}% savings rate</span>
          </p>
        </div>

        {/* Income */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
              Income
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 tracking-tight text-emerald-600 dark:text-emerald-400">
            +{formatCurrency(stats.income)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">This month</p>
        </div>

        {/* Expenses */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
              Expenses
            </span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 tracking-tight text-rose-600 dark:text-rose-400">
            -{formatCurrency(stats.expenses)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">This month</p>
        </div>

        {/* Budget Score */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
              Budget Score
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {stats.budgetScore}
            </p>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
            Top: {stats.topCategory.name}
          </p>
        </div>
      </div>

      {/* Main Charts Grid (1 col mobile, 2 col desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Category Donut */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Spending by Category
            </h2>
            <span className="text-xs text-slate-500">Current Month</span>
          </div>

          {categoryData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                <Wallet className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No expenses logged this month
              </p>
              <button
                onClick={onOpenAddTransaction}
                className="mt-3 text-xs text-indigo-600 font-semibold hover:underline"
              >
                + Add your first transaction
              </button>
            </div>
          ) : (
            <div className="h-64 w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Spent']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(val) => <span className="text-xs text-slate-600 dark:text-slate-300">{val}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 6-Month Income vs Expenses Bar Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Income vs Expenses
            </h2>
            <span className="text-xs text-slate-500">Last 6 Months</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), '']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(val) => <span className="text-xs text-slate-600 dark:text-slate-300">{val}</span>}
                />
                <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Budget vs Actual & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Progress */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Budget vs Actual
            </h2>
            <button
              onClick={() => onNavigateTab('budgets')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {budgetProgress.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">No active budgets for this month.</p>
              <button
                onClick={() => onNavigateTab('budgets')}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
              >
                + Set monthly budget
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {budgetProgress.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.category_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">
                        {formatCurrency(item.actual)} / {formatCurrency(item.planned_amount)}
                      </span>
                      {item.isOverBudget && (
                        <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Over</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.isOverBudget
                          ? 'bg-rose-500'
                          : item.percentage > 85
                          ? 'bg-amber-500'
                          : 'bg-indigo-600'
                      }`}
                      style={{ width: `${Math.min(100, item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions List (Latest 5) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Recent Transactions
            </h2>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">No transactions recorded yet.</p>
              <button
                onClick={onOpenAddTransaction}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
              >
                + Record transaction
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'income'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      {tx.type === 'income' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {tx.description || tx.category_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                        <span>{tx.category_name}</span>
                        <span>•</span>
                        <span>{formatDate(tx.date)}</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold shrink-0 ml-3 ${
                      tx.type === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
