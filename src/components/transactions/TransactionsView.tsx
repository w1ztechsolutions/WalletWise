import React, { useState, useMemo } from 'react'
import {
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Filter,
  Edit2,
  Trash2,
  Repeat,
  X,
  FileText,
} from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Transaction, TransactionType } from '@/types'

interface TransactionsViewProps {
  isAddModalOpen: boolean
  setIsAddModalOpen: (open: boolean) => void
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ isAddModalOpen, setIsAddModalOpen }) => {
  const { transactions, categories, addTransaction, updateTransaction, deleteTransaction } = useFinance()

  // Filter States
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('')

  // Edit / Delete Dialog State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form State for Add / Edit
  const [formData, setFormData] = useState<{
    date: string
    amount: string
    description: string
    category_id: string
    type: TransactionType
    is_recurring: boolean
    notes: string
  }>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    category_id: categories[0]?.id || '',
    type: 'expense',
    is_recurring: false,
    notes: '',
  })

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      description: '',
      category_id: categories.find((c) => c.type === 'expense')?.id || categories[0]?.id || '',
      type: 'expense',
      is_recurring: false,
      notes: '',
    })
    setEditingTransaction(null)
  }

  const openEdit = (tx: Transaction) => {
    setEditingTransaction(tx)
    setFormData({
      date: tx.date,
      amount: String(tx.amount),
      description: tx.description,
      category_id: tx.category_id,
      type: tx.type,
      is_recurring: tx.is_recurring,
      notes: tx.notes || '',
    })
    setIsAddModalOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(formData.amount)
    if (isNaN(amt) || amt <= 0) return

    const selectedCat = categories.find((c) => c.id === formData.category_id)
    const category_name = selectedCat?.name || 'General'

    if (editingTransaction) {
      updateTransaction(editingTransaction.id, {
        date: formData.date,
        amount: amt,
        description: formData.description.trim(),
        category_id: formData.category_id,
        category_name,
        type: formData.type,
        is_recurring: formData.is_recurring,
        notes: formData.notes.trim(),
      })
    } else {
      addTransaction({
        date: formData.date,
        amount: amt,
        description: formData.description.trim(),
        category_id: formData.category_id,
        category_name,
        type: formData.type,
        is_recurring: formData.is_recurring,
        notes: formData.notes.trim(),
      })
    }

    setIsAddModalOpen(false)
    resetForm()
  }

  // Filtered Transactions
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const matchSearch =
        tx.description.toLowerCase().includes(search.toLowerCase()) ||
        tx.category_name.toLowerCase().includes(search.toLowerCase()) ||
        (tx.notes && tx.notes.toLowerCase().includes(search.toLowerCase()))
      const matchType = typeFilter === 'all' || tx.type === typeFilter
      const matchCategory = categoryFilter === 'all' || tx.category_id === categoryFilter
      const matchMonth = !monthFilter || tx.date.startsWith(monthFilter)
      return matchSearch && matchType && matchCategory && matchMonth
    })
  }, [transactions, search, typeFilter, categoryFilter, monthFilter])

  // Filtered Summary
  const summary = useMemo(() => {
    let income = 0
    let expense = 0
    filtered.forEach((t) => {
      if (t.type === 'income') income += t.amount
      else expense += t.amount
    })
    return { income, expense, net: income - expense }
  }, [filtered])

  // Grouped by Date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    const sorted = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    sorted.forEach((tx) => {
      if (!groups[tx.date]) groups[tx.date] = []
      groups[tx.date].push(tx)
    })
    return groups
  }, [filtered])

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Top Action & Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Filtered Income</span>
          <p className="text-lg sm:text-xl font-bold text-success mt-1">
            +{formatCurrency(summary.income)}
          </p>
        </div>
        <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Filtered Expense</span>
          <p className="text-lg sm:text-xl font-bold text-danger mt-1">
            -{formatCurrency(summary.expense)}
          </p>
        </div>
        <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card">
          <span className="text-xs text-muted font-medium">Net Difference</span>
          <p
            className={`text-lg sm:text-xl font-bold mt-1 ${
              summary.net >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {formatCurrency(summary.net)}
          </p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-surface rounded-2xl p-4 border border-hairline shadow-card space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search description, category, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo"
            />
          </div>

          {/* Add Transaction Button */}
          <button
            onClick={() => {
              resetForm()
              setIsAddModalOpen(true)
            }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gold hover:bg-gold-hover text-ink shadow-gold text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Transaction</span>
          </button>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 border-t border-hairline">
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs rounded-xl bg-surface-3 border border-hairline text-muted text-platinum focus:outline-none focus:ring-1 focus:ring-indigo"
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expense Only</option>
            </select>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl bg-surface-3 border border-hairline text-muted text-platinum focus:outline-none focus:ring-1 focus:ring-indigo"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl bg-surface-3 border border-hairline text-muted text-platinum focus:outline-none focus:ring-1 focus:ring-indigo"
            />
          </div>
        </div>
      </div>

      {/* Transactions Grouped By Date */}
      {Object.keys(groupedByDate).length === 0 ? (
        <div className="bg-surface rounded-2xl p-12 border border-hairline text-center">
          <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-muted mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-platinum">
            No transactions found
          </h3>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Try adjusting your search query, clearing filters, or record a new transaction.
          </p>
          <button
            onClick={() => {
              resetForm()
              setIsAddModalOpen(true)
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-gold text-ink text-xs font-semibold hover:bg-gold-hover shadow-gold transition-colors"
          >
            + Add Transaction
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, items]) => (
            <div
              key={date}
              className="bg-surface rounded-2xl border border-hairline shadow-card overflow-hidden"
            >
              {/* Date Header */}
              <div className="bg-surface-2 px-4 py-2 border-b border-hairline flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">
                  {formatDate(date)}
                </span>
                <span className="text-[11px] text-muted">{items.length} records</span>
              </div>

              {/* Transactions in this date */}
              <div className="divide-y divide-hairline">
                {items.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 flex items-center justify-between hover:bg-surface-3 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          tx.type === 'income'
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}
                      >
                        {tx.type === 'income' ? (
                          <ArrowDownLeft className="w-5 h-5" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-platinum truncate">
                            {tx.description || tx.category_name}
                          </p>
                          {tx.is_recurring && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo/15 border border-indigo/40 text-platinum text-[10px] font-medium shrink-0">
                              <Repeat className="w-2.5 h-2.5" />
                              <span>Recurring</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-3 text-muted">
                            {tx.category_name}
                          </span>
                          {tx.notes && (
                            <span className="text-xs text-muted truncate max-w-xs hidden sm:inline">
                              "{tx.notes}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span
                        className={`text-sm sm:text-base font-bold ${
                          tx.type === 'income'
                            ? 'text-success'
                            : 'text-platinum'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </span>

                      {/* Actions: Edit & Delete (visible on hover / focus) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(tx)}
                          className="p-1.5 text-muted hover:text-indigo hover:bg-surface-3 rounded-lg transition-colors"
                          title="Edit transaction"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(tx.id)}
                          className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl border border-hairline">
            <div className="flex items-center justify-between pb-4 border-b border-hairline">
              <h3 className="text-base font-bold text-platinum">
                {editingTransaction ? 'Edit Transaction' : 'Record Transaction'}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false)
                  resetForm()
                }}
                className="text-muted hover:text-platinum p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-surface-3 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      type: 'expense',
                      category_id: categories.find((c) => c.type === 'expense')?.id || prev.category_id,
                    }))
                  }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    formData.type === 'expense'
                      ? 'bg-surface text-danger shadow-card'
                      : 'text-muted hover:text-platinum'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      type: 'income',
                      category_id: categories.find((c) => c.type === 'income')?.id || prev.category_id,
                    }))
                  }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    formData.type === 'income'
                      ? 'bg-surface text-success shadow-card'
                      : 'text-muted hover:text-platinum'
                  }`}
                >
                  Income
                </button>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Category *
                </label>
                <select
                  required
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                >
                  {categories
                    .filter((c) => c.type === formData.type)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Description / Payee
                </label>
                <input
                  type="text"
                  placeholder="e.g. Grocery store, Client invoice"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                />
              </div>

              {/* Recurring Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={formData.is_recurring}
                  onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo focus:ring-indigo border-hairline"
                />
                <label htmlFor="recurring" className="text-xs font-medium text-muted">
                  Mark as recurring monthly transaction
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context or receipt details..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false)
                    resetForm()
                  }}
                  className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl transition-all"
                >
                  {editingTransaction ? 'Save Changes' : 'Record Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-hairline text-center">
            <h4 className="text-base font-bold text-platinum">
              Delete Transaction?
            </h4>
            <p className="text-xs text-muted mt-2">
              This action cannot be undone and will update your dashboard calculations.
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
                  deleteTransaction(deletingId)
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
