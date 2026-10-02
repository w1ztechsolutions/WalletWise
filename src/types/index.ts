export type TransactionType = 'income' | 'expense'

export type AccountType = 'cash' | 'bank' | 'mobile_wallet'

export interface Category {
  id: string
  name: string
  type: TransactionType
  color: string
  icon: string
  created_date?: string
  updated_date?: string
  created_by_id: string
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  amount: number
  description: string
  category_id: string
  category_name: string
  type: TransactionType
  is_recurring: boolean
  notes?: string
  created_date?: string
  updated_date?: string
  created_by_id: string
}

export interface Budget {
  id: string
  month: string // YYYY-MM
  category_id: string
  category_name: string
  planned_amount: number
  notes?: string
  created_date?: string
  updated_date?: string
  created_by_id: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  institution: string
  account_number: string // Masked, e.g. "•••• 4821" or last 4 digits
  balance: number
  color: string
  notes?: string
  is_active: boolean
  created_date?: string
  updated_date?: string
  created_by_id: string
}

export interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
}

export interface MonthSummary {
  netBalance: number
  income: number
  expenses: number
  savingsRate: number
  budgetScore: number
  topCategory?: {
    name: string
    amount: number
  }
}

export interface BudgetProgress {
  category_id: string
  category_name: string
  color: string
  planned: number
  actual: number
  percentage: number
  isOverBudget: boolean
}
