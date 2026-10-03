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
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { useBudgets, useAddBudget, useUpdateBudget, useDeleteBudget } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { useTransactions } from '@/hooks/useTransactions'
import { useCurrency } from '@/hooks/useUser'
import { useFinance } from '@/context/FinanceContext'
import type { Budget } from '@/types'

export const BudgetsView: React.FC = () => {
  const { addToast } = useFinance()
  const currency = useCurrency()
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth())

  const { data: budgets = [] } = useBudgets(selectedMonth)
  const { data: categories = [], isPending: isLoadingCategories } = useCategories()
  const { data: transactions = [] } = useTransactions({ month: selectedMonth, type: 'expense' })
  const { mutate: createBudget } = useAddBudget()
  const { mutate: saveBudget, isPending: isSaving } = useUpdateBudget()
  const { mutate: removeBudget } = useDeleteBudget()

  const expenseCategoryId = useMemo(
    () => categories.find((c) => c.type === 'expense')?.id || categories[0]?.id || '',
    [categories]
  )

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formData, setFormData] = useState<{
    category_id: string
    planned_amount: string
    notes: string
  }>({
    category_id: expenseCategoryId,
    planned_amount: '',
    notes: '',
  })

  // Categories arrive after first paint; derive the id the form actually submits
  // rather than syncing state through an effect.
  const activeCategoryId =
    formData.category_id && categories.some((c) => c.id === formData.category_id)
      ? formData.category_id
      : expenseCategoryId

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

  // Category spending for selected month
  const categoryActuals = useMemo(() => {
    const map: Record<string, number> = {}
    transactions.forEach((t) => {
      map[t.category_id] = (map[t.category_id] || 0) + t.amount
    })
    return map
  }, [transactions])

  // Summary
  const summary = useMemo(() => {
    let totalPlanned = 0
    let totalActual = 0

    budgets.forEach((b) => {
      totalPlanned += b.planned_amount
      totalActual += categoryActuals[b.category_id] || 0
    })

    const variance = totalPlanned - totalActual
    return { totalPlanned, totalActual, variance }
  }, [budgets, categoryActuals])

  const resetForm = () => {
    setFormData({
      category_id: expenseCategoryId,
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

    const cat = categories.find((c) => c.id === activeCategoryId)
    const category_name = cat?.name || 'Category'

    if (editingBudget) {
      saveBudget(
        {
          id: editingBudget.id,
          category_id: activeCategoryId,
          category_name,
          planned_amount: amt,
          notes: formData.notes.trim(),
        },
        {
          onSuccess: () =>
            addToast('Budget updated', 'Planned amount updated successfully.', 'success'),
          onError: (err: unknown) =>
            addToast(
              'Unable to update budget',
              err instanceof Error ? err.message : 'Please try again.',
              'error'
            ),
        }
      )
    } else {
      // Client-side duplicate check. `functions/api/budgets/index.ts` also
      // returns 409 for the same case via its unique index; both paths surface
      // the same toast so the user sees one consistent message.
      const alreadyBudgeted = budgets.some(
        (b) => b.month === selectedMonth && b.category_id === activeCategoryId
      )
      if (alreadyBudgeted) {
        addToast(
          'Duplicate budget',
          'A budget already exists for this category in this month.',
          'error'
        )
        return
      }

      createBudget(
        {
          month: selectedMonth,
          category_id: activeCategoryId,
          category_name,
          planned_amount: amt,
          notes: formData.notes.trim(),
        },
        {
          onSuccess: () =>
            addToast(
              'Budget created',
              `Planned budget of ${amt} for ${category_name}`,
              'success'
            ),
          onError: (err: unknown) =>
            addToast(
              'Duplicate budget',
              err instanceof Error && err.message
                ? err.message
                : 'A budget already exists for this category in this month.',
              'error'
            ),
        }
      )
    }

    setIsModalOpen(false)
    resetForm()
  }

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {isLoadingCategories && (
        <div className="flex items-center justify-center gap-3 py-10 rounded-2xl bg-surface border border-hairline">
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin border-gold" />
          <span className="text-xs text-muted">Loading budgets…</span>
        </div>
      )}

      {/* Month Navigator Header */}
      <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-hairline shadow-card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 rounded-xl border border-hairline hover:bg-surface-3 transition-colors"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center sm:text-left min-w-[160px]">
            <span className="text-[11px] text-muted font-medium uppercase tracking-wider">
              Selected Period
            </span>
            <h2 className="text-base sm:text-lg font-bold text-platinum">
              Budgets for {monthLabel}
            </h2>
          </div>
          <button
            onClick={() => changeMonth(1)}
            className="p-2 rounded-xl border border-hairline hover:bg-surface-3 transition-colors"
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
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gold hover:bg-gold-hover text-ink shadow-gold text-sm font-semibold transition-all w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Set Budget</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Total Planned</span>
          <p className="text-xl font-bold text-platinum mt-1">
            {formatCurrency(summary.totalPlanned, currency)}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Total Spent (Actual)</span>
          <p className="text-xl font-bold text-danger mt-1">
            {formatCurrency(summary.totalActual, currency)}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Variance (Remaining)</span>
          <p
            className={`text-xl font-bold mt-1 ${
              summary.variance >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {summary.variance >= 0 ? '+' : ''}
            {formatCurrency(summary.variance, currency)}
          </p>
        </div>
      </div>

      {/* Budget Cards with Progress Bars */}
      {budgets.length === 0 ? (
        <div className="bg-surface rounded-2xl p-12 border border-hairline text-center">
          <PiggyBank className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-platinum">
            No budgets configured for {monthLabel}
          </h3>
          <p className="text-xs text-muted mt-1">
            Plan your monthly spending caps per category to track variance and stay on target.
          </p>
          <button
            onClick={() => {
              resetForm()
              setIsModalOpen(true)
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-gold text-ink text-xs font-semibold hover:bg-gold-hover shadow-gold"
          >
            + Create First Budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((b) => {
            const actual = categoryActuals[b.category_id] || 0
            const percentage = b.planned_amount > 0 ? Math.round((actual / b.planned_amount) * 100) : 0
            const isOver = actual > b.planned_amount
            const cat = categories.find((c) => c.id === b.category_id)
            const remaining = b.planned_amount - actual

            return (
              <div
                key={b.id}
                className="bg-surface rounded-2xl p-5 border border-hairline shadow-card space-y-4 group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat?.color || '#6366f1' }}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-platinum">
                        {b.category_name}
                      </h4>
                      {b.notes && <p className="text-xs text-muted">{b.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(b)}
                      className="p-1.5 text-muted hover:text-indigo rounded-lg hover:bg-surface-3"
                      title="Edit budget"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingId(b.id)}
                      className="p-1.5 text-muted hover:text-danger rounded-lg hover:bg-danger/10"
                      title="Delete budget"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">
                      Spent: <strong className="text-platinum">{formatCurrency(actual, currency)}</strong>
                    </span>
                    <span className="text-muted">
                      Target: <strong className="text-platinum">{formatCurrency(b.planned_amount, currency)}</strong>
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOver
                          ? 'bg-danger'
                          : percentage > 80
                          ? 'bg-warning'
                          : 'bg-success'
                      }`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted">
                    {percentage}% allocated
                  </span>
                  <div className="flex items-center gap-1">
                    {isOver ? (
                      <span className="inline-flex items-center gap-1 font-bold text-danger">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Over by {formatCurrency(Math.abs(remaining), currency)}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-success">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{formatCurrency(remaining, currency)} remaining</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-hairline">
            <div className="flex items-center justify-between pb-4 border-b border-hairline">
              <h3 className="text-base font-bold text-platinum">
                {editingBudget ? 'Edit Budget' : `Set Budget for ${monthLabel}`}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  resetForm()
                }}
                className="text-muted hover:text-platinum p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Expense Category *
                </label>
                <select
                  required
                  disabled={!!editingBudget}
                  value={activeCategoryId}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo disabled:opacity-60"
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
                  <p className="text-[10px] text-muted mt-1">
                    Category cannot be changed during edit. Create a new budget instead.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
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
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Notes / Goals (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Keep under 500 for holiday savings"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl disabled:opacity-60 disabled:cursor-wait"
                >
                  {isSaving ? 'Saving…' : editingBudget ? 'Update Budget' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-hairline text-center">
            <h4 className="text-base font-bold text-platinum">
              Delete Budget?
            </h4>
            <p className="text-xs text-muted mt-2">
              This will remove the spending target for this category in {monthLabel}.
            </p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeBudget(deletingId, { onSuccess: () => addToast('Budget deleted', 'Budget allocation removed.', 'info'), onError: (err: unknown) => addToast('Unable to delete budget', err instanceof Error ? err.message : 'Please try again.', 'error') })
                  setDeletingId(null)
                }}
                className="px-4 py-2 text-xs font-semibold bg-danger hover:bg-danger/90 text-ink rounded-xl"
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
