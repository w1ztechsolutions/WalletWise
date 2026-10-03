import React, { useState } from 'react'
import {
  Tag,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  FileJson,
  Sparkles,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { apiFetch, describeApiError } from '@/lib/api'
import { validateFileForKind } from '@/lib/storagePolicy'
import { normalizeSheets, type RawBudget, type RawTransaction } from '@/lib/importParser'
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
import {
  useBulkImport,
  type ImportPayload,
  type ImportPreview,
  type DuplicateDecision,
} from '@/hooks/useBulkImport'
import { ImportReviewModal } from './ImportReviewModal'
import type { Account, Category, TransactionType } from '@/types'

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

/** Response contract of `POST /api/ai/parse-spreadsheet` (Phase 6.6). */
interface AiParseResponse {
  transactions: RawTransaction[]
  budgets: RawBudget[]
  warnings: string[]
  stats: {
    sheets: number
    rows: number
    chunks: number
    aiChunks: number
    fallbackChunks: number
    dropped: number
  }
  source: 'ai' | 'fallback' | 'mixed'
}

interface ImportSheet {
  name: string
  rows: Record<string, unknown>[]
}

export const SettingsView: React.FC = () => {
  const { addToast } = useFinance()
  const currency = useCurrency()
  const { data: categories = [] } = useCategories()
  const { data: transactions = [] } = useTransactions()
  const { data: accounts = [], isPending: isAccountsPending } = useAccounts()
  const { mutate: createCategory } = useAddCategory()
  const { mutate: saveCategory, isPending: isSavingCategory } = useUpdateCategory()
  const { mutate: removeCategory } = useDeleteCategory()
  const { previewImportAsync, commitImport, isCommitting: isCommittingImport } = useBulkImport()

  // Tab
  const [activeSettingsTab, setActiveSettingsTab] = useState<'categories' | 'import' | 'reports' | 'account'>('categories')
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
  const [reportMonth, setReportMonth] = useState<string>(getCurrentMonth())
  const [reportType, setReportType] = useState<'all' | TransactionType>('all')

  // Excel Import State
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{ transactionsCount: number; budgetsCount: number } | null>(null)
  // Rows awaiting review + the server's classification of them.
  const [pendingImport, setPendingImport] = useState<ImportPayload | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

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

  // Excel File Upload → R2 archive → Workers AI normalization (Phase 6.6)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (isAccountsPending) {
      addToast('Accounts are loading', 'Wait for your accounts to load, then retry the import.', 'info')
      return
    }

    const invalid = validateFileForKind('import', file)
    if (invalid) {
      addToast('Invalid file', invalid, 'error')
      return
    }

    setIsImporting(true)
    setImportStatus('Reading spreadsheet sheets...')

    try {
      // 1. Read the workbook client-side (SheetJS) into plain row objects.
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheets: ImportSheet[] = workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
        return { name: sheetName, rows }
      })

      // 2. Archive the original file in private R2 storage (best-effort —
      //    the import must still succeed when storage is not configured).
      setImportStatus('Archiving original file to secure storage...')
      try {
        const archived = await apiFetch<{ uploadUrl: string; key: string; contentType: string }>(
          '/storage/upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              kind: 'import',
              fileName: file.name,
              contentType: file.type,
              contentLength: file.size,
            }),
          }
        )
        const put = await fetch(archived.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': archived.contentType },
          body: file,
        })
        if (!put.ok) throw new Error(`Storage responded with status ${put.status}`)
      } catch {
        addToast(
          'Archive skipped',
          'The original spreadsheet could not be archived; parsing continues.',
          'info'
        )
      }

      // 3. Normalize records — Workers AI endpoint with a local deterministic
      //    fallback when the API is unreachable (e.g. plain `npm run dev`).
      setImportStatus('Normalizing records with Workers AI...')
      const today = new Date().toISOString().split('T')[0]
      let result: AiParseResponse
      try {
        result = await apiFetch<AiParseResponse>('/ai/parse-spreadsheet', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            defaultDate: today,
            defaultMonth: today.slice(0, 7),
            sheets,
          }),
        })
      } catch {
        addToast(
          'AI parsing unavailable',
          'Using standard column matching to normalize your spreadsheet.',
          'info'
        )
        const fallback = normalizeSheets(sheets, {
          defaultDate: today,
          defaultMonth: today.slice(0, 7),
        })
        result = { ...fallback, source: 'fallback', stats: { sheets: sheets.length, rows: 0, chunks: 0, aiChunks: 0, fallbackChunks: 1, dropped: 0 } }
      }

      // 4. Resolve categories by name (create missing ones once).
      setImportStatus('Matching categories...')

      // Categories are matched by name. Any category the sheet references but the
      // account does not have must exist in D1 *before* the import rows are
      // built — `transactions.category_id` is a real foreign key, so a
      // placeholder id here would fail the insert. Create them all first, then
      // map rows onto the returned ids.
      const desired = new Map<string, TransactionType>()
      for (const t of result.transactions) {
        const key = t.category.trim().toLowerCase()
        if (!desired.has(key)) desired.set(key, t.type)
      }
      for (const b of result.budgets) {
        const key = b.category.trim().toLowerCase()
        if (!desired.has(key)) desired.set(key, 'expense')
      }

      const resolved = new Map<string, Category>()
      const missing: { name: string; type: TransactionType }[] = []

      for (const [key, type] of desired) {
        const existing = categories.find((c) => c.name.toLowerCase() === key)
        if (existing) resolved.set(key, existing)
        else missing.push({ name: key || 'general', type })
      }

      await Promise.all(
        missing.map(({ name, type }) =>
          new Promise<void>((resolve) => {
            createCategory(
              {
                name: name.charAt(0).toUpperCase() + name.slice(1),
                type,
                color: PRESET_CATEGORY_COLORS[resolved.size % PRESET_CATEGORY_COLORS.length],
                icon: 'Tag',
              },
              {
                onSuccess: (created) => {
                  resolved.set(name, created)
                  resolve()
                },
                onError: (err: unknown) => {
                  addToast(
                    'Category not created',
                    `"${name}" could not be created (${
                      err instanceof Error ? err.message : 'unknown error'
                    }); its rows will be imported without a category link.`,
                    'warning'
                  )
                  resolve()
                },
              }
            )
          })
        )
      )

      const lookupCategory = (name: string): Category | null => {
        const key = (name.trim() || 'general').toLowerCase()
        return resolved.get(key) ?? categories.find((c) => c.name.toLowerCase() === key) ?? null
      }

      const accountsByName = new Map<string, Account[]>()
      for (const account of accounts) {
        const key = account.name.trim().toLowerCase()
        accountsByName.set(key, [...(accountsByName.get(key) ?? []), account])
      }
      const unmatchedAccountNames = new Set<string>()
      const extractedTransactions = result.transactions.map((t) => {
        const cat = lookupCategory(t.category)
        const accountName = t.account.trim()
        const matchingAccounts = accountName ? accountsByName.get(accountName.toLowerCase()) ?? [] : []
        if (accountName && matchingAccounts.length !== 1) unmatchedAccountNames.add(accountName)
        return {
          date: t.date,
          amount: t.amount,
          description: t.description,
          category_id: cat?.id ?? '',
          account_id: matchingAccounts.length === 1 ? matchingAccounts[0].id : null,
          category_name: cat?.name ?? (t.category || 'General'),
          type: t.type,
          is_recurring: t.is_recurring,
          notes: `Imported from ${file.name}`,
        }
      })

      if (unmatchedAccountNames.size > 0) {
        addToast(
          'Some accounts were not linked',
          `${unmatchedAccountNames.size} account name${unmatchedAccountNames.size === 1 ? '' : 's'} did not uniquely match an existing account. Those transactions will be imported unlinked.`,
          'warning'
        )
      }

      const extractedBudgets = result.budgets.map((b) => {
        const cat = lookupCategory(b.category)
        return {
          month: b.month,
          category_id: cat?.id ?? '',
          category_name: cat?.name ?? (b.category || 'General'),
          planned_amount: b.planned_amount,
          notes: `Imported from ${file.name}`,
        }
      })

      if (result.warnings.length > 0) {
        addToast(
          'Import notes',
          result.warnings.slice(0, 2).join(' '),
          result.source === 'ai' ? 'info' : 'warning'
        )
      }

      if (extractedTransactions.length > 0 || extractedBudgets.length > 0) {
        setImportStatus('Checking for duplicates...')
        const payload: ImportPayload = {
          transactions: extractedTransactions,
          budgets: extractedBudgets,
        }
        const preview = await previewImportAsync(payload)
        setPendingImport(payload)
        setImportPreview(preview)
      } else {
        addToast('No records found', 'The spreadsheet did not contain recognized columns.', 'info')
      }
    } catch (err: unknown) {
      addToast(
        'Import error',
        describeApiError(err, 'The spreadsheet could not be prepared. Check the file and try again.'),
        'error'
      )
    } finally {
      setIsImporting(false)
      setImportStatus(null)
    }
  }

  const handleConfirmImport = (decisions: Record<string, DuplicateDecision>) => {
    if (!pendingImport) return
    commitImport(
      { ...pendingImport, decisions },
      {
        onSuccess: (result) => {
          const importedTx = result.inserted.transactions
          const importedBg = result.inserted.budgets
          const replaced = result.replaced.transactions + result.replaced.budgets

          setImportProgress({ transactionsCount: importedTx, budgetsCount: importedBg })
          addToast(
            'Import completed',
            `Imported ${importedTx} transactions and ${importedBg} budgets${
              replaced > 0 ? `, replaced ${replaced} existing` : ''
            }.`,
            'success'
          )
          if (result.invalid.length > 0) {
            addToast(
              'Rows skipped',
              `${result.invalid.length} invalid row${
                result.invalid.length === 1 ? '' : 's'
              } could not be imported.`,
              'warning'
            )
          }
          setPendingImport(null)
          setImportPreview(null)
        },
        onError: (err: unknown) =>
          addToast(
            'Import failed',
            describeApiError(
              err,
              'Your review is still open. Check Transactions before retrying if you are unsure whether any rows were saved.'
            ),
            'error'
          ),
      }
    )
  }

  const cancelImport = () => {
    setPendingImport(null)
    setImportPreview(null)
  }

  // Download CSV Template
  const downloadTemplate = (type: 'transactions' | 'budgets') => {
    let csv = ''
    let filename = ''
    if (type === 'transactions') {
      csv = 'Date,Description,Category,Type,Amount,Recurring,Account,Notes\n2026-10-01,Monthly Rent,Rent & Housing,expense,850.00,true,Daily Checking,Apartment lease\n2026-10-02,Client Payment,Freelance & Business,income,1200.00,false,,Design project\n'
      filename = 'walletwise_transactions_template.csv'
    } else {
      csv = 'Month,Category,PlannedAmount,Notes\n2026-10,Groceries & Food,500.00,Food budget cap\n2026-10,Utilities & Internet,150.00,Power and fiber\n'
      filename = 'walletwise_budgets_template.csv'
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    addToast('Template downloaded', `Saved ${filename}`, 'success')
  }

  // Export Report as CSV or JSON
  const filteredReport = transactions.filter((t) => {
    const matchMonth = !reportMonth || t.date.startsWith(reportMonth)
    const matchType = reportType === 'all' || t.type === reportType
    return matchMonth && matchType
  })

  const exportReport = (format: 'csv' | 'json') => {
    if (filteredReport.length === 0) {
      addToast('No data', 'There are no records to export for this filter.', 'info')
      return
    }

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(filteredReport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `walletwise_report_${reportMonth || 'all'}.json`
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
      link.download = `walletwise_report_${reportMonth || 'all'}.csv`
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
          onClick={() => setActiveSettingsTab('import')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeSettingsTab === 'import'
              ? 'bg-surface text-platinum shadow-card'
              : 'text-muted hover:text-platinum text-muted'
          }`}
        >
          Excel & Templates
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

      {/* 2. Excel & CSV Import */}
      {activeSettingsTab === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* File Dropzone */}
          <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo" />
              <h3 className="text-base font-bold text-platinum">
                AI Excel & CSV Spreadsheet Import
              </h3>
            </div>
            <p className="text-xs text-muted">
              Upload bank statements, budgeting sheets, or expense exports (.xlsx, .xls, .csv).
              The engine automatically normalizes columns, categorizes records, and batch inserts
              data scoped to your account.
            </p>

            <div className="border-2 border-dashed border-hairline rounded-2xl p-8 text-center hover:border-indigo transition-colors relative cursor-pointer group bg-surface-3/50">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud className="w-10 h-10 text-indigo mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-semibold text-platinum">
                Click or drag Excel/CSV file here
              </p>
              <p className="text-xs text-muted mt-1">Supports multi-sheet workbooks up to 10MB</p>
            </div>

            {isImporting && (
              <div className="p-4 rounded-xl bg-indigo/10 border border-indigo/40 text-xs text-platinum flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-indigo border-t-transparent rounded-full animate-spin" />
                <span>{importStatus}</span>
              </div>
            )}

            {importProgress && !isImporting && (
              <div className="p-4 rounded-xl bg-success/10 border border-success/40 text-xs text-platinum flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>
                  Successfully imported {importProgress.transactionsCount} transactions and{' '}
                  {importProgress.budgetsCount} budgets.
                </span>
              </div>
            )}
          </div>

          {/* Download CSV Templates */}
          <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-card space-y-4">
            <h3 className="text-base font-bold text-platinum">
              Starter CSV Templates
            </h3>
            <p className="text-xs text-muted">
              Need a standardized layout for manual data entry? Download pre-formatted CSV templates
              ready for upload.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-hairline bg-surface-3/40">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-indigo" />
                  <div>
                    <p className="text-xs font-bold text-platinum">
                      Transactions Template (.csv)
                    </p>
                    <p className="text-[11px] text-muted">Date, Description, Category, Type, Amount, Account</p>
                  </div>
                </div>
                <button
                  onClick={() => downloadTemplate('transactions')}
                  className="p-2 rounded-xl text-indigo hover:bg-indigo/15 transition-colors"
                  title="Download template"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl border border-hairline bg-surface-3/40">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-success" />
                  <div>
                    <p className="text-xs font-bold text-platinum">
                      Budgets Template (.csv)
                    </p>
                    <p className="text-[11px] text-muted">Month, Category, PlannedAmount, Notes</p>
                  </div>
                </div>
                <button
                  onClick={() => downloadTemplate('budgets')}
                  className="p-2 rounded-xl text-success hover:bg-success/10 transition-colors"
                  title="Download template"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Reports & Export */}
      {activeSettingsTab === 'reports' && (
        <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-card space-y-6">
          <div>
            <h3 className="text-base font-bold text-platinum">
              Financial Reports & Data Export
            </h3>
            <p className="text-xs text-muted">
              Filter records by month or type, preview totals, and download in CSV or JSON format.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Filter by Month
              </label>
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Filter by Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum"
              >
                <option value="all">All Types</option>
                <option value="income">Income Only</option>
                <option value="expense">Expense Only</option>
              </select>
            </div>
          </div>

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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold hover:bg-gold-hover text-ink shadow-gold text-xs font-semibold transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => exportReport('json')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-3 hover:bg-hairline text-platinum text-xs font-semibold transition-all"
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

      {/* Import review — the only place rows reach D1 */}
      {pendingImport && importPreview && (
        <ImportReviewModal
          preview={importPreview}
          accountNames={Object.fromEntries(accounts.map((account) => [account.id, account.name]))}
          isCommitting={isCommittingImport}
          onCancel={cancelImport}
          onConfirm={handleConfirmImport}
        />
      )}
    </div>
  )
}
