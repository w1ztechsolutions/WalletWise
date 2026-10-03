import React, { useState } from 'react'
import {
  Download,
  Plus,
  Trash2,
  Edit2,
  X,
  FileJson,
} from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import {
  useCategories,
  useAddCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/useCategories'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCurrency, useUser } from '@/hooks/useUser'
import { useScheduleAccountDeletion } from '@/hooks/useAccountDeletion'
import type { Category, TransactionType } from '@/types'

const PRESET_CATEGORY_COLORS = [
  '#10b981',
  '#06b6d4',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#3b82f6',
  '#14b8a6',
  '#64748b',
]

export const SettingsView: React.FC = () => {
  const { addToast } = useFinance()
  const currency = useCurrency()
  const { data: categories = [] } = useCategories()
  const { data: transactions = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { mutate: createCategory } = useAddCategory()
  const { mutate: saveCategory, isPending: isSavingCategory } = useUpdateCategory()
  const { mutate: removeCategory } = useDeleteCategory()

  // Tab
  const [activeSettingsTab, setActiveSettingsTab] = useState<'categories' | 'reports' | 'account'>('categories')
  const [deletionConfirmation, setDeletionConfirmation] = useState('')
  const { data: user } = useUser()
  const { mutate: scheduleDeletion, isPending: isSchedulingDeletion } = useScheduleAccountDeletion()

  // Category modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryFormData, setCategoryFormData] = useState<{
    name: string
    type: TransactionType
    color: string
    icon: string
  }>({
    name: '',
    type: 'expense',
    color: PRESET_CATEGORY_COLORS[0],
    icon: 'Tag',
  })

  // Reports Filter & State
  const currentReportMonth = getCurrentMonth()
  const [reportStartDate, setReportStartDate] = useState(`${currentReportMonth}-01`)
  const [reportEndDate, setReportEndDate] = useState(() => {
    const [year, month] = currentReportMonth.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    return `${currentReportMonth}-${String(lastDay).padStart(2, '0')}`
  })
  const [reportType, setReportType] = useState<'all' | TransactionType>('all')

  // Handlers for Categories
  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat)
    setCategoryFormData({
      name: cat.name,
      type: cat.type,
      color: cat.color,
      icon: cat.icon || 'Tag',
    })
    setIsCategoryModalOpen(true)
  }

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryFormData.name.trim()) return

    const payload = {
      name: categoryFormData.name.trim(),
      type: categoryFormData.type,
      color: categoryFormData.color,
    }

    if (editingCategory) {
      saveCategory(
        { id: editingCategory.id, ...payload },
        {
          onSuccess: () =>
            addToast('Category updated', 'Category details were updated successfully.', 'success'),
          onError: (err: unknown) =>
            addToast(
              'Unable to update category',
              err instanceof Error ? err.message : 'Please try again.',
              'error'
            ),
        }
      )
    } else {
      createCategory(
        { ...payload, icon: 'Tag' },
        {
          onSuccess: () =>
            addToast('Category created', `"${payload.name}" has been added.`, 'success'),
          onError: (err: unknown) =>
            addToast(
              'Unable to create category',
              err instanceof Error ? err.message : 'Please try again.',
              'error'
            ),
        }
      )
    }
    setIsCategoryModalOpen(false)
    setEditingCategory(null)
    setCategoryFormData({
      name: '',
      type: 'expense',
      color: PRESET_CATEGORY_COLORS[0],
      icon: 'Tag',
    })
  }

  /**
   * Category deletion is guarded client-side only — nothing server-side stops a
   * category from being orphaned mid-write, so the transaction list check stays.
   */
  const handleDeleteCategory = (id: string) => {
    if (transactions.some((t) => t.category_id === id)) {
      addToast('Cannot delete category', 'Transactions are currently linked to this category.', 'error')
      return
    }
    removeCategory(id, {
      onSuccess: () => addToast('Category removed', 'Category was deleted.', 'info'),
      onError: (err: unknown) =>
        addToast(
          'Unable to remove category',
          err instanceof Error ? err.message : 'Please try again.',
          'error'
        ),
    })
  }

  // Export Report as CSV or JSON
  const isReportRangeInvalid = !reportStartDate || !reportEndDate || reportStartDate > reportEndDate
  const filteredReport = transactions.filter((t) => {
    const matchDate = t.date >= reportStartDate && t.date <= reportEndDate
    const matchType = reportType === 'all' || t.type === reportType
    return matchDate && matchType
  })

  const exportReport = (format: 'csv' | 'json') => {
    if (isReportRangeInvalid) {
      addToast('Invalid date range', 'The start date must be on or before the end date.', 'error')
      return
    }
    if (filteredReport.length === 0) {
      addToast('No data', 'There are no records to export for this filter.', 'info')
      return
    }

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(filteredReport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `walletwise_report_${reportStartDate}_to_${reportEndDate}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      const headers = 'ID,Date,Description,Category,Type,Amount,Recurring,Account,Notes\n'
      const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
      const accountNames = new Map(accounts.map((account) => [account.id, account.name]))
      const rows = filteredReport
        .map(
          (t) =>
            [
              csvCell(t.id),
              csvCell(t.date),
              csvCell(t.description),
              csvCell(t.category_name),
              csvCell(t.type),
              String(t.amount),
              String(t.is_recurring),
              csvCell(accountNames.get(t.account_id ?? '') ?? ''),
              csvCell(t.notes || ''),
            ].join(',')
        )
        .join('\n')
      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `walletwise_report_${reportStartDate}_to_${reportEndDate}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    addToast('Report exported', `Generated report with ${filteredReport.length} records.`, 'success')
  }

  const handleScheduleDeletion = (event: React.FormEvent) => {
    event.preventDefault()
    scheduleDeletion(undefined, {
      onSuccess: (result) => {
        setDeletionConfirmation('')
        addToast(
          'Deletion scheduled',
          `Your account will be permanently deleted after ${new Date(result.deletionScheduledFor ?? '').toLocaleString()}.`,
          'warning'
        )
      },
      onError: (error: unknown) =>
        addToast('Unable to schedule deletion', error instanceof Error ? error.message : 'Please try again.', 'error'),
    })
  }

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1 bg-surface-2 rounded-2xl w-fit max-w-full">
        <button
          onClick={() => setActiveSettingsTab('categories')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeSettingsTab === 'categories'
              ? 'bg-surface text-platinum shadow-card'
              : 'text-muted hover:text-platinum text-muted'
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveSettingsTab('reports')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeSettingsTab === 'reports'
              ? 'bg-surface text-platinum shadow-card'
              : 'text-muted hover:text-platinum text-muted'
          }`}
        >
          Export Reports
        </button>
        <button
          onClick={() => setActiveSettingsTab('account')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeSettingsTab === 'account'
              ? 'bg-surface text-platinum shadow-card'
              : 'text-muted hover:text-platinum'
          }`}
        >
          Account deletion
        </button>
      </div>

      {activeSettingsTab === 'account' && (
        <section className="max-w-2xl space-y-5 border-t border-danger/40 pt-5" aria-labelledby="account-deletion-title">
          <div>
            <h3 id="account-deletion-title" className="text-base font-bold text-platinum">Delete your WalletWise account</h3>
            <p className="text-xs text-muted mt-1">
              Signed in as {user?.email ?? 'your account'}.
            </p>
          </div>
          <div className="space-y-2 text-sm text-muted">
            <p>Deletion starts with a 30-day recovery period. During that time, you can preview your financial data but cannot make changes.</p>
            <p>Restore your account at any time before the deadline to regain access. After the deadline, your profile, credentials, financial records, and stored files are permanently deleted automatically.</p>
          </div>
          <form onSubmit={handleScheduleDeletion} className="space-y-3">
            <label htmlFor="deletion-confirmation" className="block text-xs font-medium text-platinum">
              Type DELETE to confirm
            </label>
            <input
              id="deletion-confirmation"
              value={deletionConfirmation}
              onChange={(event) => setDeletionConfirmation(event.target.value)}
              autoComplete="off"
              className="w-full max-w-sm rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-platinum focus:outline-none focus:ring-2 focus:ring-danger"
            />
            <div>
              <button
                type="submit"
                disabled={deletionConfirmation !== 'DELETE' || isSchedulingDeletion}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isSchedulingDeletion ? 'Scheduling…' : 'Schedule account deletion'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 1. Category Management */}
      {activeSettingsTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-platinum">
                Categories
              </h3>
              <p className="text-xs text-muted">
                Manage income and expense classifications for transactions and budgets.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCategory(null)
                setCategoryFormData({
                  name: '',
                  type: 'expense',
                  color: PRESET_CATEGORY_COLORS[0],
                  icon: 'Tag',
                })
                setIsCategoryModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold hover:bg-gold-hover text-ink shadow-gold text-xs font-semibold transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Category</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-surface p-4 rounded-2xl border border-hairline shadow-card flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div>
                    <h4 className="text-sm font-semibold text-platinum">
                      {cat.name}
                    </h4>
                    <span className="text-[11px] font-medium capitalize text-muted">
                      {cat.type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditCategory(cat)}
                    className="p-1.5 text-muted hover:text-indigo rounded-lg hover:bg-surface-3"
                    title="Edit category"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1.5 text-muted hover:text-danger rounded-lg hover:bg-danger/10"
                    title="Delete category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reports & Export */}
      {activeSettingsTab === 'reports' && (
        <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-card space-y-6">
          <div>
            <h3 className="text-base font-bold text-platinum">
              Financial Reports & Data Export
            </h3>
            <p className="text-xs text-muted">
              Filter transactions by date range and type, preview totals, and download in CSV or JSON format.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="report-start-date" className="block text-xs font-medium text-muted mb-1">
                From date
              </label>
              <input
                id="report-start-date"
                type="date"
                required
                max={reportEndDate}
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum"
              />
            </div>

            <div>
              <label htmlFor="report-end-date" className="block text-xs font-medium text-muted mb-1">
                To date
              </label>
              <input
                id="report-end-date"
                type="date"
                required
                min={reportStartDate}
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum"
              />
            </div>

            <div>
              <label htmlFor="report-type" className="block text-xs font-medium text-muted mb-1">
                Filter by Type
              </label>
              <select
                id="report-type"
                value={reportType}
                onChange={(e) => setReportType(e.target.value as TransactionType | 'all')}
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum"
              >
                <option value="all">All Types</option>
                <option value="income">Income Only</option>
                <option value="expense">Expense Only</option>
              </select>
            </div>
          </div>

          {isReportRangeInvalid && (
            <p className="text-xs text-danger" role="alert">
              {!reportStartDate || !reportEndDate
                ? 'Both dates are required.'
                : 'The start date must be on or before the end date.'}
            </p>
          )}

          {/* Report Preview */}
          <div className="p-4 rounded-2xl bg-surface-3/50 border border-hairline flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[11px] text-muted">Matching Records</span>
                <p className="text-base font-bold text-platinum">
                  {filteredReport.length}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-muted">Total Volume</span>
                <p className="text-base font-bold text-platinum">
                  {formatCurrency(filteredReport.reduce((sum, t) => sum + t.amount, 0), currency)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => exportReport('csv')}
                disabled={isReportRangeInvalid}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold hover:bg-gold-hover text-ink shadow-gold text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => exportReport('json')}
                disabled={isReportRangeInvalid}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-3 hover:bg-hairline text-platinum text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-hairline">
            <div className="flex items-center justify-between pb-4 border-b border-hairline">
              <h3 className="text-base font-bold text-platinum">
                {editingCategory ? 'Edit Category' : 'Create Category'}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-muted hover:text-platinum p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Subscriptions, Groceries"
                  value={categoryFormData.name}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryFormData({ ...categoryFormData, type: 'expense' })}
                    className={`py-2 text-xs font-semibold rounded-xl border ${
                      categoryFormData.type === 'expense'
                        ? 'border-danger bg-danger/10 text-danger'
                        : 'border-hairline text-muted'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFormData({ ...categoryFormData, type: 'income' })}
                    className={`py-2 text-xs font-semibold rounded-xl border ${
                      categoryFormData.type === 'income'
                        ? 'border-success bg-success/10 text-success'
                        : 'border-hairline text-muted'
                    }`}
                  >
                    Income
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Color Tag
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CATEGORY_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setCategoryFormData({ ...categoryFormData, color: col })}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        categoryFormData.color === col ? 'scale-125 ring-2 ring-gold ring-offset-2 ring-offset-surface' : ''
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl disabled:opacity-60 disabled:cursor-wait"
                >
                  {isSavingCategory ? 'Saving…' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
