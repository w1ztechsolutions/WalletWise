import React, { useState } from 'react'
import { CheckCircle2, Download, Sparkles, UploadCloud } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFinance } from '@/context/FinanceContext'
import { apiFetch, describeApiError } from '@/lib/api'
import { validateFileForKind } from '@/lib/storagePolicy'
import { normalizeSheets, type RawBudget, type RawTransaction } from '@/lib/importParser'
import { useCategories, useAddCategory } from '@/hooks/useCategories'
import { useAccounts } from '@/hooks/useAccounts'
import {
  useBulkImport,
  type ImportPayload,
  type ImportPreview,
  type DuplicateDecision,
} from '@/hooks/useBulkImport'
import { ImportReviewModal } from '@/components/settings/ImportReviewModal'
import type { Account, Category, TransactionType } from '@/types'

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

interface SpreadsheetImportProps {
  kind: 'transactions' | 'budgets'
}

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

export const SpreadsheetImport: React.FC<SpreadsheetImportProps> = ({ kind }) => {
  const { addToast } = useFinance()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [], isPending: isAccountsPending } = useAccounts()
  const { mutate: createCategory } = useAddCategory()
  const { previewImportAsync, commitImport, isCommitting: isCommittingImport } = useBulkImport()
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{ transactionsCount: number; budgetsCount: number } | null>(null)
  const [pendingImport, setPendingImport] = useState<ImportPayload | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  const label = kind === 'transactions' ? 'transactions' : 'budgets'
  const otherLabel = kind === 'transactions' ? 'budgets' : 'transactions'

  const downloadTemplate = () => {
    const csv = kind === 'transactions'
      ? 'Date,Description,Category,Type,Amount,Recurring,Account,Notes\n2026-10-01,Monthly Rent,Rent & Housing,expense,850.00,true,Daily Checking,Apartment lease\n2026-10-02,Client Payment,Freelance & Business,income,1200.00,false,,Design project\n'
      : 'Month,Category,PlannedAmount,Notes\n2026-10,Groceries & Food,500.00,Food budget cap\n2026-10,Utilities & Internet,150.00,Power and fiber\n'
    const filename = `walletwise_${kind}_template.csv`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    addToast('Template downloaded', `Saved ${filename}`, 'success')
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (kind === 'transactions' && isAccountsPending) {
      addToast('Accounts are loading', 'Wait for your accounts to load, then retry the import.', 'info')
      return
    }

    const invalid = validateFileForKind('import', file)
    if (invalid) {
      addToast('Invalid file', invalid, 'error')
      return
    }

    setIsImporting(true)
    setImportProgress(null)
    setImportStatus('Reading spreadsheet sheets...')

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheets: ImportSheet[] = workbook.SheetNames.map((sheetName) => ({
        name: sheetName,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }),
      }))

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
        addToast('Archive skipped', 'The original spreadsheet could not be archived; parsing continues.', 'info')
      }

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
        addToast('AI parsing unavailable', 'Using standard column matching to normalize your spreadsheet.', 'info')
        const fallback = normalizeSheets(sheets, { defaultDate: today, defaultMonth: today.slice(0, 7) })
        result = {
          ...fallback,
          source: 'fallback',
          stats: { sheets: sheets.length, rows: 0, chunks: 0, aiChunks: 0, fallbackChunks: 1, dropped: 0 },
        }
      }

      const selectedTransactions = kind === 'transactions' ? result.transactions : []
      const selectedBudgets = kind === 'budgets' ? result.budgets : []
      const ignoredCount = kind === 'transactions' ? result.budgets.length : result.transactions.length
      if (ignoredCount > 0) {
        addToast(
          'Other rows excluded',
          `${ignoredCount} ${otherLabel} were not imported. Use the ${otherLabel} tab to import them.`,
          'info'
        )
      }

      setImportStatus('Matching categories...')
      const desired = new Map<string, TransactionType>()
      for (const transaction of selectedTransactions) {
        const key = transaction.category.trim().toLowerCase()
        if (!desired.has(key)) desired.set(key, transaction.type)
      }
      for (const budget of selectedBudgets) {
        const key = budget.category.trim().toLowerCase()
        if (!desired.has(key)) desired.set(key, 'expense')
      }

      const resolved = new Map<string, Category>()
      const missing: { name: string; type: TransactionType }[] = []
      for (const [key, type] of desired) {
        const existing = categories.find((category) => category.name.toLowerCase() === key)
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
                onError: (error: unknown) => {
                  addToast(
                    'Category not created',
                    `"${name}" could not be created (${error instanceof Error ? error.message : 'unknown error'}); its rows will be imported without a category link.`,
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
        return resolved.get(key) ?? categories.find((category) => category.name.toLowerCase() === key) ?? null
      }
      const accountsByName = new Map<string, Account[]>()
      for (const account of accounts) {
        const key = account.name.trim().toLowerCase()
        accountsByName.set(key, [...(accountsByName.get(key) ?? []), account])
      }
      const unmatchedAccountNames = new Set<string>()
      const extractedTransactions = selectedTransactions.map((transaction) => {
        const category = lookupCategory(transaction.category)
        const accountName = transaction.account.trim()
        const matchingAccounts = accountName ? accountsByName.get(accountName.toLowerCase()) ?? [] : []
        if (accountName && matchingAccounts.length !== 1) unmatchedAccountNames.add(accountName)
        return {
          date: transaction.date,
          amount: transaction.amount,
          description: transaction.description,
          category_id: category?.id ?? '',
          account_id: matchingAccounts.length === 1 ? matchingAccounts[0].id : null,
          category_name: category?.name ?? (transaction.category || 'General'),
          type: transaction.type,
          is_recurring: transaction.is_recurring,
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

      const extractedBudgets = selectedBudgets.map((budget) => {
        const category = lookupCategory(budget.category)
        return {
          month: budget.month,
          category_id: category?.id ?? '',
          category_name: category?.name ?? (budget.category || 'General'),
          planned_amount: budget.planned_amount,
          notes: `Imported from ${file.name}`,
        }
      })

      if (result.warnings.length > 0) {
        addToast('Import notes', result.warnings.slice(0, 2).join(' '), result.source === 'ai' ? 'info' : 'warning')
      }

      if (extractedTransactions.length > 0 || extractedBudgets.length > 0) {
        setImportStatus('Checking for duplicates...')
        const payload: ImportPayload = { transactions: extractedTransactions, budgets: extractedBudgets }
        const preview = await previewImportAsync(payload)
        setPendingImport(payload)
        setImportPreview(preview)
      } else {
        addToast('No records found', `The spreadsheet did not contain recognized ${label} columns.`, 'info')
      }
    } catch (error: unknown) {
      addToast('Import error', describeApiError(error, 'The spreadsheet could not be prepared. Check the file and try again.'), 'error')
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
          const transactionsCount = result.inserted.transactions
          const budgetsCount = result.inserted.budgets
          const replaced = result.replaced.transactions + result.replaced.budgets
          setImportProgress({ transactionsCount, budgetsCount })
          addToast(
            'Import completed',
            `Imported ${transactionsCount} transactions and ${budgetsCount} budgets${replaced > 0 ? `, replaced ${replaced} existing` : ''}.`,
            'success'
          )
          if (result.invalid.length > 0) {
            addToast('Rows skipped', `${result.invalid.length} invalid row${result.invalid.length === 1 ? '' : 's'} could not be imported.`, 'warning')
          }
          setPendingImport(null)
          setImportPreview(null)
        },
        onError: (error: unknown) =>
          addToast(
            'Import failed',
            describeApiError(error, 'Your review is still open. Check the relevant tab before retrying if you are unsure whether any rows were saved.'),
            'error'
          ),
      }
    )
  }

  const cancelImport = () => {
    setPendingImport(null)
    setImportPreview(null)
  }

  return (
    <section className="bg-surface p-4 sm:p-5 rounded-2xl border border-hairline shadow-card space-y-4" aria-label={`Import ${label}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo" />
          <div>
            <h3 className="text-sm font-bold text-platinum">Import {label}</h3>
            <p className="text-xs text-muted">Upload an Excel or CSV file. Only {label} are imported here.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-hairline text-xs font-semibold text-platinum hover:bg-surface-3"
        >
          <Download className="w-3.5 h-3.5" />
          Download {kind} template
        </button>
      </div>

      <label className="border-2 border-dashed border-hairline rounded-xl p-5 text-center hover:border-indigo transition-colors relative cursor-pointer group bg-surface-3/50 block">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          aria-label={`Import ${label} spreadsheet`}
          onChange={handleFileUpload}
          disabled={isImporting}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <UploadCloud className="w-7 h-7 text-indigo mx-auto mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-sm font-semibold text-platinum">Choose or drop Excel/CSV file</span>
        <span className="block text-xs text-muted mt-1">Multi-sheet workbooks supported, up to 10MB</span>
      </label>

      {isImporting && (
        <div className="p-3 rounded-xl bg-indigo/10 border border-indigo/40 text-xs text-platinum flex items-center gap-3" role="status">
          <div className="w-4 h-4 border-2 border-indigo border-t-transparent rounded-full animate-spin" />
          <span>{importStatus}</span>
        </div>
      )}

      {importProgress && !isImporting && (
        <div className="p-3 rounded-xl bg-success/10 border border-success/40 text-xs text-platinum flex items-center gap-2" role="status">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>
            Successfully imported {kind === 'transactions' ? importProgress.transactionsCount : importProgress.budgetsCount} {label}.
          </span>
        </div>
      )}

      {pendingImport && importPreview && (
        <ImportReviewModal
          preview={importPreview}
          accountNames={Object.fromEntries(accounts.map((account) => [account.id, account.name]))}
          isCommitting={isCommittingImport}
          onCancel={cancelImport}
          onConfirm={handleConfirmImport}
        />
      )}
    </section>
  )
}