import React, { useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  BarChart2,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency } from '@/lib/utils'

export const AnalyticsView: React.FC = () => {
  const { transactions, categories, budgets } = useFinance()

  // 1. All-time summary
  const summary = useMemo(() => {
    let income = 0
    let expenses = 0

    transactions.forEach((t) => {
      if (t.type === 'income') income += t.amount
      else expenses += t.amount
    })

    const net = income - expenses
    const savingsRate = income > 0 ? Math.max(0, Math.round(((income - expenses) / income) * 100)) : 0

    return { income, expenses, net, savingsRate }
  }, [transactions])

  // 2. Monthly Income vs Expenses Trend (All available months)
  const monthlyTrend = useMemo(() => {
    const monthMap: Record<string, { month: string; Income: number; Expenses: number; Net: number }> = {}

    transactions.forEach((t) => {
      const ym = t.date.substring(0, 7) // YYYY-MM
      if (!monthMap[ym]) {
        monthMap[ym] = { month: ym, Income: 0, Expenses: 0, Net: 0 }
      }
      if (t.type === 'income') monthMap[ym].Income += t.amount
      else monthMap[ym].Expenses += t.amount
    })

    const sortedMonths = Object.keys(monthMap).sort()
    return sortedMonths.map((ym) => {
      const [y, m] = ym.split('-').map(Number)
      const d = new Date(y, m - 1, 1)
      const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
      const data = monthMap[ym]
      return {
        month: label,
        Income: data.Income,
        Expenses: data.Expenses,
        Net: data.Income - data.Expenses,
      }
    })
  }, [transactions])

  // 3. Spending by Category (Top categories + "Other" bucket)
  const categoryPieData = useMemo(() => {
    const map: Record<string, { name: string; amount: number; color: string }> = {}
    let totalExpense = 0

    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        totalExpense += t.amount
        if (!map[t.category_name]) {
          const cat = categories.find((c) => c.id === t.category_id)
          map[t.category_name] = {
            name: t.category_name,
            amount: 0,
            color: cat?.color || '#6366f1',
          }
        }
        map[t.category_name].amount += t.amount
      })

    const sorted = Object.values(map).sort((a, b) => b.amount - a.amount)

    if (sorted.length <= 5) {
      return { items: sorted, totalExpense }
    }

    const top5 = sorted.slice(0, 5)
    const otherAmount = sorted.slice(5).reduce((sum, item) => sum + item.amount, 0)
    top5.push({ name: 'Other Categories', amount: otherAmount, color: '#94a3b8' })

    return { items: top5, totalExpense }
  }, [transactions, categories])

  // 4. Top spending categories ranking with percentages
  const topSpendingRanked = useMemo(() => {
    const map: Record<string, { name: string; amount: number; color: string }> = {}
    let totalExpense = 0

    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        totalExpense += t.amount
        if (!map[t.category_name]) {
          const cat = categories.find((c) => c.id === t.category_id)
          map[t.category_name] = {
            name: t.category_name,
            amount: 0,
            color: cat?.color || '#6366f1',
          }
        }
        map[t.category_name].amount += t.amount
      })

    return Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({
        ...item,
        percentage: totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0,
      }))
  }, [transactions, categories])

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">All-Time Income</span>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            +{formatCurrency(summary.income)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">All-Time Expenses</span>
          <p className="text-xl sm:text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            -{formatCurrency(summary.expenses)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Net Savings</span>
          <p
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              summary.net >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatCurrency(summary.net)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Overall Savings Rate</span>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary.savingsRate}%
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Monthly Income vs Expenses Trend
            </h3>
            <p className="text-xs text-slate-400">Historical performance across all recorded periods</p>
          </div>
        </div>

        {monthlyTrend.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No transaction data available</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
        )}
      </div>

      {/* Grid: Category Breakdown Pie & Top Categories Ranked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Spending Distribution
            </h3>
            <span className="text-xs text-slate-400">Top Categories + Other</span>
          </div>

          {categoryPieData.items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-sm text-slate-500">
              No expenses recorded
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData.items}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="amount"
                  >
                    {categoryPieData.items.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [formatCurrency(Number(val)), 'Total']}
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

        {/* Top Spending Categories List */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Top Spending Categories
            </h3>
            <span className="text-xs text-slate-400">Ranked by volume</span>
          </div>

          {topSpendingRanked.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No expense records found</div>
          ) : (
            <div className="space-y-4">
              {topSpendingRanked.map((item, idx) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-500">
                        {idx + 1}
                      </span>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className="text-slate-400">({item.percentage}%)</span>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
