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
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAnalytics, type AnalyticsOverview, type AnalyticsMonthly } from '@/hooks/useAnalytics'
import { useCategories } from '@/hooks/useCategories'
import { useCurrency } from '@/hooks/useUser'

interface DashboardViewProps {
  onNavigateTab: (tab: any) => void
  onOpenAddTransaction: () => void
}

const TOOLTIP_STYLE = {
  backgroundColor: '#1A1A24',
  border: '1px solid #2D2D3A',
  borderRadius: '0.75rem',
  fontSize: '12px',
  color: '#E2E8F0',
}

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  boxShadow: 'var(--shadow-card)',
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab, onOpenAddTransaction }) => {
  const currency = useCurrency()
  const { data: overview, isPending: isLoading } = useAnalytics<AnalyticsOverview>('overview')
  const { data: monthly } = useAnalytics<AnalyticsMonthly>('monthly')
  const { data: categories } = useCategories()

  // Empty state until D1 answers; never render NaN from an undefined payload.
  const stats = useMemo(() => {
    const income = overview?.income ?? 0
    const expenses = overview?.expenses ?? 0
    const netBalance = overview?.netBalance ?? 0
    const savingsRate = overview?.savingsRate ?? 0

    const topSpending = (overview?.categorySpending ?? []).reduce(
      (acc, row) => (row.total > acc.amount ? { name: row.category_name, amount: row.total } : acc),
      { name: 'None', amount: 0 }
    )

    const totalPlanned = (overview?.budgets ?? []).reduce((sum, b) => sum + b.planned_amount, 0)

    let budgetScore = 85
    if (totalPlanned > 0) {
      const ratio = expenses / totalPlanned
      if (ratio <= 0.8) budgetScore = 95
      else if (ratio <= 1.0) budgetScore = 80
      else budgetScore = Math.max(20, Math.round(80 - (ratio - 1) * 60))
    } else if (income > 0) {
      budgetScore = Math.min(100, Math.max(30, Math.round((netBalance / income) * 100)))
    }

    return { income, expenses, netBalance, savingsRate, budgetScore, topCategory: topSpending }
  }, [overview])

  const categoryData = useMemo(() => {
    const colorFor = (name: string) =>
      categories?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.color ?? '#4F46E5'

    return (overview?.categorySpending ?? []).map((row) => ({
      name: row.category_name,
      value: row.total,
      color: colorFor(row.category_name),
    }))
  }, [overview, categories])

  const monthlyTrendData = useMemo(() => {
    const months = monthly?.months ?? []
    return months.map((row) => ({
      month: new Date(`${row.month}-01T00:00:00`).toLocaleString('en-US', { month: 'short' }),
      Income: row.income,
      Expenses: row.expenses,
    }))
  }, [monthly])

  const budgetProgress = useMemo(() => {
    const spendByName = new Map(
      (overview?.categorySpending ?? []).map((row) => [row.category_name, row.total])
    )
    const colorFor = (name: string) =>
      categories?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.color ?? '#4F46E5'

    return (overview?.budgets ?? []).map((b) => {
      const actual = spendByName.get(b.category_name) ?? 0
      const percentage = b.planned_amount > 0 ? Math.round((actual / b.planned_amount) * 100) : 0
      return {
        ...b,
        actual,
        percentage,
        color: colorFor(b.category_name),
        isOverBudget: actual > b.planned_amount,
      }
    })
  }, [overview, categories])

  const recentTransactions = useMemo(() => overview?.recentTransactions ?? [], [overview])

  return (
    <div className="space-y-5 pb-20 md:pb-8">

      {/* D1 has not answered yet — show a placeholder rather than a zeroed dashboard. */}
      {isLoading && (
        <div className="flex items-center justify-center gap-3 p-10 rounded-2xl" style={CARD_STYLE}>
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent-gold)', borderTopColor: 'transparent' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loading your dashboard…</span>
        </div>
      )}

      {/* ── Hero Banner */}
      <div
        className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        style={{
          background: 'linear-gradient(135deg, #1A1A24 0%, #222232 50%, #1A1A24 100%)',
          border: '1px solid var(--border)',
          boxShadow: '0 0 60px rgba(217,119,6,0.06), 0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--accent-gold)' }}>
            Monthly Overview
          </p>
          <p className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(stats.netBalance, currency)}
          </p>
          <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            {stats.netBalance >= 0 ? (
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} />
            ) : (
              <TrendingDown className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            )}
            Net balance · {stats.savingsRate}% savings rate this month
          </p>
        </div>
        <div
          className="flex items-center gap-4 shrink-0"
        >
          <div className="text-center">
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Income</p>
            <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>+{formatCurrency(stats.income, currency)}</p>
          </div>
          <div className="w-px h-10" style={{ backgroundColor: 'var(--border)' }} />
          <div className="text-center">
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Expenses</p>
            <p className="text-lg font-bold" style={{ color: 'var(--danger)' }}>-{formatCurrency(stats.expenses, currency)}</p>
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Net Balance */}
        <div className="p-4 sm:p-5 rounded-2xl relative overflow-hidden" style={CARD_STYLE}>
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Net Balance</span>
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-indigo-subtle)' }}>
              <Wallet className="w-4 h-4" style={{ color: 'var(--accent-indigo)' }} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 tracking-tight"
            style={{ color: stats.netBalance >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
            {formatCurrency(stats.netBalance, currency)}
          </p>
          <p className="text-xs font-medium mt-1 flex items-center gap-1"
            style={{ color: stats.netBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            <TrendingUp className="w-3 h-3" />
            <span>{stats.savingsRate}% savings</span>
          </p>
        </div>

        {/* Income */}
        <div className="p-4 sm:p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Income</span>
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--success-subtle)' }}>
              <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--success)' }} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 tracking-tight" style={{ color: 'var(--success)' }}>
            +{formatCurrency(stats.income, currency)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>This month</p>
        </div>

        {/* Expenses */}
        <div className="p-4 sm:p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Expenses</span>
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--danger-subtle)' }}>
              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 tracking-tight" style={{ color: 'var(--danger)' }}>
            -{formatCurrency(stats.expenses, currency)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>This month</p>
        </div>

        {/* Budget Score */}
        <div className="p-4 sm:p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Budget Score</span>
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-gold-subtle)' }}>
              <Target className="w-4 h-4" style={{ color: 'var(--accent-gold)' }} />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <p className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {stats.budgetScore}
            </p>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>/ 100</span>
          </div>
          <p className="text-xs truncate mt-1" style={{ color: 'var(--text-secondary)' }}>
            Top: {stats.topCategory.name}
          </p>
        </div>
      </div>

      {/* ── Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Donut: Spending by Category */}
        <div className="p-5 rounded-2xl flex flex-col" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Spending by Category</h2>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Current Month</span>
          </div>

          {categoryData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                style={{ backgroundColor: 'var(--bg-surface-2)' }}>
                <Wallet className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No expenses this month</p>
              <button onClick={onOpenAddTransaction} className="mt-3 text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent-gold)' }}>
                + Add your first transaction
              </button>
            </div>
          ) : (
            <div className="h-64 w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value">
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [formatCurrency(Number(value), currency), 'Spent']}
                    contentStyle={TOOLTIP_STYLE} />
                  <Legend verticalAlign="bottom" height={36}
                    formatter={(val) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{val}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Bar: Income vs Expenses (6 months) */}
        <div className="p-5 rounded-2xl flex flex-col" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Income vs Expenses</h2>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Last 6 Months</span>
          </div>
          {monthlyTrendData.every((d) => d.Income === 0 && d.Expenses === 0) ? (
            <div className="h-64 w-full flex flex-col items-center justify-center text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No data for this period</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Record a transaction to populate the trend.</p>
            </div>
          ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(val: any) => [formatCurrency(Number(val), currency), '']}
                  contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend verticalAlign="bottom" height={36}
                  formatter={(val) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{val}</span>} />
                <Bar dataKey="Income" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      </div>

      {/* ── Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Budget vs Actual */}
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Budget vs Actual</h2>
            <button onClick={() => onNavigateTab('budgets')}
              className="text-xs font-semibold flex items-center gap-0.5 hover:underline"
              style={{ color: 'var(--accent-gold)' }}>
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {budgetProgress.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No active budgets this month.</p>
              <button onClick={() => onNavigateTab('budgets')}
                className="mt-2 text-xs font-semibold hover:underline" style={{ color: 'var(--accent-gold)' }}>
                + Set monthly budget
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {budgetProgress.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {item.category_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {formatCurrency(item.actual, currency)} / {formatCurrency(item.planned_amount, currency)}
                      </span>
                      {item.isOverBudget && (
                        <span className="flex items-center gap-0.5 font-semibold" style={{ color: 'var(--danger)' }}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>Over</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, item.percentage)}%`,
                        backgroundColor: item.isOverBudget
                          ? 'var(--danger)'
                          : item.percentage > 85
                          ? '#F59E0B'
                          : 'var(--accent-gold)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="p-5 rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Transactions</h2>
            <button onClick={() => onNavigateTab('transactions')}
              className="text-xs font-semibold flex items-center gap-0.5 hover:underline"
              style={{ color: 'var(--accent-gold)' }}>
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No transactions yet.</p>
              <button onClick={onOpenAddTransaction} className="mt-2 text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent-gold)' }}>
                + Record transaction
              </button>
            </div>
          ) : (
            <div className="space-y-0" style={{ borderTop: '1px solid var(--border)' }}>
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="py-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: tx.type === 'income' ? 'var(--success-subtle)' : 'var(--danger-subtle)',
                        color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {tx.type === 'income' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {tx.description || tx.category_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>{tx.category_name}</span>
                        <span>·</span>
                        <span>{formatDate(tx.date)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-bold shrink-0 ml-3"
                    style={{ color: tx.type === 'income' ? 'var(--success)' : 'var(--text-primary)' }}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, currency)}
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
