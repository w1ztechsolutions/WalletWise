import React, { useMemo, useState } from 'react'
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
import { formatCurrency } from '@/lib/utils'
import {
  useAnalytics,
  type AnalyticsAllTime,
  type AnalyticsMonthly,
  type AnalyticsRange,
} from '@/hooks/useAnalytics'
import { useCategories } from '@/hooks/useCategories'
import { useCurrency } from '@/hooks/useUser'

export const AnalyticsView: React.FC = () => {
  const currency = useCurrency()
  const [preset, setPreset] = useState<'6' | '12' | '24' | 'all' | 'custom'>('6')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range: AnalyticsRange = useMemo(() => {
    if (preset === 'all') return { months: 'all' as const }
    if (preset === 'custom' && customStart && customEnd) return { start: customStart, end: customEnd }
    if (preset === 'custom') return { months: 6 }
    return { months: Number(preset) }
  }, [preset, customStart, customEnd])

  const { data: allTime, isPending: isLoadingAllTime } = useAnalytics('all-time', range)
  const { data: monthly, isPending: isLoadingMonthly } = useAnalytics('monthly', range)
  const { data: categories } = useCategories()

  const rangeLabel = useMemo(() => {
    const start = (monthly as AnalyticsMonthly | undefined)?.start ?? (allTime as AnalyticsAllTime | undefined)?.start
    const end = (monthly as AnalyticsMonthly | undefined)?.end ?? (allTime as AnalyticsAllTime | undefined)?.end
    if (!start || !end) return 'All recorded periods'
    const fmt = (ym: string) => {
      const [y, m] = ym.split('-').map(Number)
      return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
    }
    return `${fmt(start)} – ${fmt(end)}`
  }, [monthly, allTime])

  // 1. All-time summary
  const summary = useMemo(() => {
    const data = allTime as AnalyticsAllTime | undefined
    const income = data?.totalIncome ?? 0
    const expenses = data?.totalExpenses ?? 0
    const net = data?.netBalance ?? 0
    const savingsRate = data?.savingsRate ?? 0
    return { income, expenses, net, savingsRate }
  }, [allTime])

  // 2. Monthly Income vs Expenses Trend (window served by the API per `range`)
  const monthlyTrend = useMemo(() => {
    const months = (monthly as AnalyticsMonthly | undefined)?.months ?? []
    return months.map((row) => {
      const [y, m] = row.month.split('-').map(Number)
      const d = new Date(y, m - 1, 1)
      return {
        month: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        Income: row.income,
        Expenses: row.expenses,
        Net: row.net,
      }
    })
  }, [monthly])

  // 3. Spending by Category (Top categories + "Other" bucket)
  const categoryPieData = useMemo(() => {
    const colorFor = (name: string) =>
      categories?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.color ?? '#6366f1'

    const items = ((allTime as AnalyticsAllTime | undefined)?.topCategories ?? []).map((row) => ({
      name: row.category_name,
      amount: row.total,
      color: colorFor(row.category_name),
    }))

    const totalExpense = items.reduce((sum, item) => sum + item.amount, 0)
    return { items, totalExpense }
  }, [allTime, categories])

  // 4. Top spending categories ranking with percentages
  const topSpendingRanked = useMemo(() => {
    const totalExpense = categoryPieData.totalExpense
    return categoryPieData.items.map((item) => ({
      ...item,
      percentage: totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0,
    }))
  }, [categoryPieData])

  if (isLoadingAllTime || isLoadingMonthly) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 rounded-2xl bg-surface border border-hairline">
        <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin border-indigo" />
        <span className="text-xs text-muted">Crunching your analytics…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Date range filter */}
      <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(['6', '12', '24', 'all', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${preset === p ? 'bg-gold text-ink shadow-gold' : 'text-muted hover:bg-surface-3'}`}
            >
              {p === '6' ? '6M' : p === '12' ? '12M' : p === '24' ? '24M' : p === 'all' ? 'All' : 'Custom'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preset === 'custom' && (
            <>
              <input
                type="month"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-surface-3 border border-hairline text-platinum"
                aria-label="Start month"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="month"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-surface-3 border border-hairline text-platinum"
                aria-label="End month"
              />
            </>
          )}
          <span className="text-xs text-muted">{rangeLabel}</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">All-Time Income</span>
          <p className="text-xl sm:text-2xl font-bold text-success mt-1">
            +{formatCurrency(summary.income, currency)}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">All-Time Expenses</span>
          <p className="text-xl sm:text-2xl font-bold text-danger mt-1">
            -{formatCurrency(summary.expenses, currency)}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Net Savings</span>
          <p
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              summary.net >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {formatCurrency(summary.net, currency)}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Overall Savings Rate</span>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-5 h-5 text-success" />
            <p className="text-xl sm:text-2xl font-bold text-platinum">
              {summary.savingsRate}%
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="bg-surface rounded-2xl p-5 border border-hairline shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-platinum">
              Monthly Income vs Expenses Trend
            </h3>
            <p className="text-xs text-muted">{rangeLabel}</p>
          </div>
        </div>

        {monthlyTrend.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">No transaction data available</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val), currency), '']}
                  contentStyle={{
                    backgroundColor: '#1A1A24',
                    borderColor: '#2D2D3A',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    color: '#E2E8F0',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(val) => <span className="text-xs text-muted">{val}</span>}
                />
                <Bar dataKey="Income" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grid: Category Breakdown Pie & Top Categories Ranked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-surface rounded-2xl p-5 border border-hairline shadow-card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-platinum">
              Spending Distribution
            </h3>
            <span className="text-xs text-muted">Top Categories + Other</span>
          </div>

          {categoryPieData.items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-sm text-muted">
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
                    formatter={(val: any) => [formatCurrency(Number(val), currency), 'Total']}
                    contentStyle={{
                      backgroundColor: '#1A1A24',
                      borderColor: '#2D2D3A',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#E2E8F0',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(val) => <span className="text-xs text-muted">{val}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Spending Categories List */}
        <div className="bg-surface rounded-2xl p-5 border border-hairline shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-platinum">
              Top Spending Categories
            </h3>
            <span className="text-xs text-muted">Ranked by volume</span>
          </div>

          {topSpendingRanked.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">No expense records found</div>
          ) : (
            <div className="space-y-4">
              {topSpendingRanked.map((item, idx) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-surface-3 flex items-center justify-center font-bold text-[10px] text-muted">
                        {idx + 1}
                      </span>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-platinum">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-platinum">
                        {formatCurrency(item.amount, currency)}
                      </span>
                      <span className="text-muted">({item.percentage}%)</span>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden">
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
