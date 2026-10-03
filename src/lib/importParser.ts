import type { TransactionType } from '@/types'

/**
 * Deterministic spreadsheet row normalizer (Phase 6.6).
 *
 * Used in two places:
 *  1. Server — as the per-chunk fallback inside `POST /api/ai/parse-spreadsheet`
 *     when Workers AI is unavailable or returns unparseable output, so imports
 *     never hard-fail.
 *  2. Client — in `SettingsView` when the AI endpoint itself is unreachable
 *     (offline dev against Vite, session expired, etc.).
 *
 * DOM-free on purpose so Pages Functions can bundle it.
 * Categories are returned as *names*; the caller resolves/creates ids.
 */

export type SheetRow = Record<string, unknown>

export interface ParsedSheetInput {
  name: string
  rows: SheetRow[]
}

export interface RawTransaction {
  date: string // YYYY-MM-DD
  amount: number
  description: string
  category: string
  account: string
  type: TransactionType
  is_recurring: boolean
}

export interface RawBudget {
  month: string // YYYY-MM
  category: string
  planned_amount: number
}

export const ACCOUNT_COLUMN_HEADERS = [
  'account name',
  'wallet name',
  'source account',
  'source wallet',
  'account',
  'wallet',
] as const

export interface NormalizeOptions {
  /** Fallback date for rows without a usable one (YYYY-MM-DD). */
  defaultDate?: string
  /** Fallback month for budget rows without a usable one (YYYY-MM). */
  defaultMonth?: string
}

export interface NormalizeResult {
  transactions: RawTransaction[]
  budgets: RawBudget[]
  warnings: string[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time)
}

export function isValidIsoMonth(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_MONTH.test(value)) return false
  const month = Number(value.slice(5, 7))
  return month >= 1 && month <= 12
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function currentMonth(): string {
  return todayIso().slice(0, 7)
}

/** Parses a numeric/currency-ish cell into a strictly positive amount. */
export function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const cleaned = String(raw ?? '').replace(/[^0-9.-]+/g, '')
  const parsed = parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : NaN
}

/** Accepts ISO strings, Date instances, and Excel serial numbers. */
export function parseDateCell(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0]
  }

  if (typeof raw === 'number' && raw > 0 && raw < 80000) {
    // Excel serial date (1900 date system, epoch 1899-12-30)
    const ms = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000
    return new Date(ms).toISOString().split('T')[0]
  }

  const str = String(raw).trim()
  if (ISO_DATE.test(str)) return isValidIsoDate(str) ? str : null

  const parsed = new Date(str)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
  return null
}

function truthyCell(raw: unknown): boolean {
  const value = String(raw ?? '').toLowerCase().trim()
  return value === 'true' || value === 'yes' || value === '1' || value === 'y'
}

/**
 * Normalizes raw spreadsheet rows (already flattened to objects) into
 * transactions and budgets with validated, strictly positive amounts and
 * ISO dates. Invalid rows are skipped and reported via `warnings`.
 */
export function normalizeSheets(
  sheets: ParsedSheetInput[],
  options: NormalizeOptions = {}
): NormalizeResult {
  const defaultDate = isValidIsoDate(options.defaultDate) ? options.defaultDate : todayIso()
  const defaultMonth = isValidIsoMonth(options.defaultMonth) ? options.defaultMonth : currentMonth()

  const transactions: RawTransaction[] = []
  const budgets: RawBudget[] = []
  const warnings: string[] = []

  for (const sheet of sheets) {
    const sheetName = (sheet.name || '').slice(0, 64)
    const isBudgetSheet = sheetName.toLowerCase().includes('budget')

    for (const row of sheet.rows) {
      try {
        const keys = Object.keys(row)
        const findKey = (candidates: string[]) =>
          keys.find((k) => candidates.some((c) => k.toLowerCase().includes(c)))

        const dateKey = findKey(['date', 'time', 'day'])
        const amountKey = findKey(['amount', 'cost', 'price', 'value', 'planned'])
        const descKey = findKey(['description', 'item', 'details', 'name', 'memo', 'payee'])
        const catKey = findKey(['category', 'type_name', 'group'])
        const typeKey = findKey(['type', 'kind'])
        const monthKey = findKey(['month', 'period'])
        const recurringKey = findKey(['recurring', 'repeat'])
        const accountKey = ACCOUNT_COLUMN_HEADERS
          .map((candidate) => keys.find((key) => key.toLowerCase().trim() === candidate))
          .find((key) => key !== undefined)

        const rawAmount = amountKey ? parseAmount(row[amountKey]) : NaN
        if (isNaN(rawAmount) || rawAmount <= 0) continue

        const catName = ((catKey ? String(row[catKey] ?? '') : '').trim() || 'General').slice(0, 100)
        const description = ((descKey ? String(row[descKey] ?? '') : '').trim() || sheetName).slice(0, 200)

        if (isBudgetSheet) {
          let month = monthKey ? String(row[monthKey] ?? '').trim() : ''
          if (!isValidIsoMonth(month)) {
            const fromCell = dateKey ? parseDateCell(row[dateKey]) : null
            month = fromCell ? fromCell.slice(0, 7) : defaultMonth
          }
          budgets.push({ month, category: catName, planned_amount: rawAmount })
          continue
        }

        const typeValue = typeKey ? String(row[typeKey] ?? '').toLowerCase() : ''
        const type: TransactionType =
          typeValue.includes('income') || sheetName.toLowerCase().includes('income')
            ? 'income'
            : 'expense'

        const date = parseDateCell(dateKey ? row[dateKey] : null) || defaultDate
        const isRecurring = recurringKey ? truthyCell(row[recurringKey]) : false

        const account = (accountKey ? String(row[accountKey] ?? '') : '').trim().slice(0, 100)
        transactions.push({ date, amount: rawAmount, description, category: catName, account, type, is_recurring: isRecurring })
      } catch {
        warnings.push(`Skipped an unreadable row in sheet "${sheetName}".`)
      }
    }
  }

  return { transactions, budgets, warnings }
}

