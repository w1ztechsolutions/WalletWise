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
import type { Category, TransactionType, Transaction, Budget } from '@/types'

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
  const {
    categories,
    transactions,
    budgets,
    addCategory,
    updateCategory,
    deleteCategory,
    batchImport,
    addToast,
    currentUser,
  } = useFinance()

  // Tab
  const [activeSettingsTab, setActiveSettingsTab] = useState<'categories' | 'import' | 'reports'>('categories')

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

    if (editingCategory) {
      updateCategory(editingCategory.id, {
        name: categoryFormData.name.trim(),
        type: categoryFormData.type,
        color: categoryFormData.color,
      })
    } else {
      addCategory({
        name: categoryFormData.name.trim(),
        type: categoryFormData.type,
        color: categoryFormData.color,
        icon: 'Tag',
      })
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

  // Excel File Upload & AI Normalization Parser
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportStatus('Reading spreadsheet sheets...')

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })

      setImportStatus('Parsing and normalizing transaction and budget records...')

      const extractedTransactions: Omit<Transaction, 'id' | 'created_by_id'>[] = []
      const extractedBudgets: Omit<Budget, 'id' | 'created_by_id'>[] = []

      // Iterate through sheet names
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

        const isBudgetSheet = sheetName.toLowerCase().includes('budget')

        json.forEach((row) => {
          // Normalize column keys
          const keys = Object.keys(row)
          const findKey = (candidates: string[]) =>
            keys.find((k) => candidates.some((c) => k.toLowerCase().includes(c)))

          const dateKey = findKey(['date', 'time', 'day'])
          const amountKey = findKey(['amount', 'cost', 'price', 'value', 'planned'])
          const descKey = findKey(['description', 'item', 'details', 'name', 'memo', 'payee'])
          const catKey = findKey(['category', 'type_name', 'group'])
          const typeKey = findKey(['type', 'kind'])

          const rawAmount = amountKey ? parseFloat(String(row[amountKey]).replace(/[^0-9.-]+/g, '')) : NaN
          if (isNaN(rawAmount) || rawAmount <= 0) return

          const catName = (catKey && String(row[catKey]).trim()) || 'General'
          const description = (descKey && String(row[descKey]).trim()) || sheetName

          // Match or create category
          let matchedCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
          if (!matchedCat) {
            const typeVal = typeKey ? String(row[typeKey]).toLowerCase() : ''
            const guessedType: TransactionType =
              typeVal.includes('income') || sheetName.toLowerCase().includes('income')
                ? 'income'
                : 'expense'
            matchedCat = addCategory({
              name: catName,
              type: guessedType,
              color: PRESET_CATEGORY_COLORS[Math.floor(Math.random() * PRESET_CATEGORY_COLORS.length)],
              icon: 'Tag',
            })
          }

          if (isBudgetSheet) {
            extractedBudgets.push({
              month: getCurrentMonth(),
              category_id: matchedCat.id,
              category_name: matchedCat.name,
              planned_amount: rawAmount,
              notes: `Imported from ${sheetName}`,
            })
          } else {
            // Transaction
            const typeVal = typeKey ? String(row[typeKey]).toLowerCase() : ''
            const guessedType: TransactionType =
              typeVal.includes('income') || sheetName.toLowerCase().includes('income')
                ? 'income'
                : 'expense'

            let dateStr = new Date().toISOString().split('T')[0]
            if (dateKey && row[dateKey]) {
              try {
                const parsedDate = new Date(row[dateKey])
                if (!isNaN(parsedDate.getTime())) {
                  dateStr = parsedDate.toISOString().split('T')[0]
                }
              } catch {
                // fallback to today
              }
            }

            extractedTransactions.push({
              date: dateStr,
              amount: rawAmount,
              description,
              category_id: matchedCat.id,
              category_name: matchedCat.name,
              type: guessedType,
              is_recurring: false,
              notes: `Imported from ${file.name}`,
            })
          }
        })
      })

      setImportProgress({
        transactionsCount: extractedTransactions.length,
        budgetsCount: extractedBudgets.length,
      })

      if (extractedTransactions.length > 0 || extractedBudgets.length > 0) {
        batchImport({
          transactions: extractedTransactions,
          budgets: extractedBudgets,
        })
      } else {
        addToast('No records found', 'The spreadsheet did not contain recognized columns.', 'info')
      }
    } catch (err: any) {
      addToast('Import error', err.message || 'Failed to parse Excel file', 'error')
    } finally {
      setIsImporting(false)
      setImportStatus(null)
    }
  }

  // Download CSV Template
  const downloadTemplate = (type: 'transactions' | 'budgets') => {
    let csv = ''
    let filename = ''
    if (type === 'transactions') {
      csv = 'Date,Description,Category,Type,Amount,Recurring,Notes\n2026-10-01,Monthly Rent,Rent & Housing,expense,850.00,true,Apartment lease\n2026-10-02,Client Payment,Freelance & Business,income,1200.00,false,Design project\n'
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
      const headers = 'ID,Date,Description,Category,Type,Amount,Recurring,Notes\n'
      const rows = filteredReport
        .map(
          (t) =>
            `"${t.id}","${t.date}","${t.description.replace(/"/g, '""')}","${t.category_name}","${t.type}",${t.amount},${t.is_recurring},"${(t.notes || '').replace(/"/g, '""')}"`
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

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Sub Tabs */}
      <div className="flex items-center gap-2 p-1 bg-surface-2 rounded-2xl w-fit">
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
      </div>

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
                    onClick={() => deleteCategory(cat.id)}
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
                    <p className="text-[11px] text-muted">Date, Description, Category, Amount, Type</p>
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
                  {formatCurrency(filteredReport.reduce((sum, t) => sum + t.amount, 0))}
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
          <div className="bg-surface rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-hairline">
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
                  className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
