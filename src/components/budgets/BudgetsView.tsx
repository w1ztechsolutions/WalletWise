import React, { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  PiggyBank,
} from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import type { Budget } from '@/types'

export const BudgetsView: React.FC = () => {
  const { budgets, transactions, categories, addBudget, updateBudget, deleteBudget } = useFinance()

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formData, setFormData] = useState<{
    category_id: string
    planned_amount: string
    notes: string
  }>({
    category_id: categories.find((c) => c.type === 'expense')?.id || categories[0]?.id || '',
    planned_amount: '',
    notes: '',
  })

  // Navigate month
  const changeMonth = (offset: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const date = new Date(y, m - 1 + offset, 1)
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    setSelectedMonth(newMonth)
  }

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const date = new Date(y, m - 1, 1)
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  }, [selectedMonth])

  // Current month budget items
  const monthBudgets = useMemo(() => {
    return budgets.filter((b) => b.month === selectedMonth)
  }, [budgets, selectedMonth])

  // Category spending for selected month
  const categoryActuals = useMemo(() => {
    const map: Record<string, number> = {}
    transactions
      .filter((t) => t.date.startsWith(selectedMonth) && t.type === 'expense')
      .forEach((t) => {
        map[t.category_id] = (map[t.category_id] || 0) + t.amount
      })
    return map
  }, [transactions, selectedMonth])

  // Summary
  const summary = useMemo(() => {
    let totalPlanned = 0
    let totalActual = 0

    monthBudgets.forEach((b) => {
      totalPlanned += b.planned_amount
      totalActual += categoryActuals[b.category_id] || 0
    })

    const variance = totalPlanned - totalActual
    return { totalPlanned, totalActual, variance }
  }, [monthBudgets, categoryActuals])

  const resetForm = () => {
    setFormData({
      category_id: categories.find((c) => c.type === 'expense')?.id || categories[0]?.id || '',
      planned_amount: '',
      notes: '',
    })
    setEditingBudget(null)
  }

  const openEdit = (b: Budget) => {
    setEditingBudget(b)
    setFormData({
      category_id: b.category_id,
      planned_amount: String(b.planned_amount),
      notes: b.notes || '',
    })
    setIsModalOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(formData.planned_amount)
    if (isNaN(amt) || amt <= 0) return

    const cat = categories.find((c) => c.id === formData.category_id)
    const category_name = cat?.name || 'Category'

    if (editingBudget) {
      updateBudget(editingBudget.id, {
        category_id: formData.category_id,
        category_name,
        planned_amount: amt,
        notes: formData.notes.trim(),
      })
    } else {
      const res = addBudget({
        month: selectedMonth,
        category_id: formData.category_id,
        category_name,
        planned_amount: amt,
        notes: formData.notes.trim(),
      })
      if (!res.success) return
    }

    setIsModalOpen(false)
    resetForm()
  }

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Month Navigator Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center sm:text-left min-w-[160px]">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Selected Period
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Budgets for {monthLabel}
            </h2>
          </div>
          <button
            onClick={() => changeMonth(1)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => {
            resetForm()
            setIsModalOpen(true)
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Set Budget</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Total Planned</span>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {formatCurrency(summary.totalPlanned)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Total Spent (Actual)</span>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {formatCurrency(summary.totalActual)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Variance (Remaining)</span>
          <p
            className={`text-xl font-bold mt-1 ${
              summary.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summary.variance >= 0 ? '+' : ''}
            {formatCurrency(summary.variance)}
          </p>
        </div>
      </div>

      {/* Budget Cards with Progress Bars */}
      {monthBudgets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200/80 dark:border-slate-800 text-center">
          <PiggyBank className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No budgets configured for {monthLabel}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Plan your monthly spending caps per category to track variance and stay on target.
          </p>
          <button
            onClick={() => {
              resetForm()
              setIsModalOpen(true)
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
          >
            + Create First Budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monthBudgets.map((b) => {
            const actual = categoryActuals[b.category_id] || 0
            const percentage = b.planned_amount > 0 ? Math.round((actual / b.planned_amount) * 100) : 0
            const isOver = actual > b.planned_amount
            const cat = categories.find((c) => c.id === b.category_id)
            const remaining = b.planned_amount - actual

            return (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat?.color || '#6366f1' }}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {b.category_name}
                      </h4>
                      {b.notes && <p className="text-xs text-slate-400">{b.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(b)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Edit budget"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingId(b.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      title="Delete budget"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Spent: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(actual)}</strong>
                    </span>
                    <span className="text-slate-500">
                      Target: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(b.planned_amount)}</strong>
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOver
                          ? 'bg-rose-500'
                          : percentage > 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    {percentage}% allocated
                  </span>
                  <div className="flex items-center gap-1">
                    {isOver ? (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Over by {formatCurrency(Math.abs(remaining))}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{formatCurrency(remaining)} remaining</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Budget Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingBudget ? 'Edit Budget' : `Set Budget for ${monthLabel}`}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  resetForm()
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expense Category *
                </label>
                <select
                  required
                  disabled={!!editingBudget}
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                >
                  {categories
                    .filter((c) => c.type === 'expense')
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
                {editingBudget && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Category cannot be changed during edit. Create a new budget instead.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Planned Monthly Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={formData.planned_amount}
                  onChange={(e) => setFormData({ ...formData, planned_amount: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes / Goals (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Keep under 500 for holiday savings"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  {editingBudget ? 'Update Budget' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Delete Budget?
            </h4>
            <p className="text-xs text-slate-500 mt-2">
              This will remove the spending target for this category in {monthLabel}.
            </p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteBudget(deletingId)
                  setDeletingId(null)
                }}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
