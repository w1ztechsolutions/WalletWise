import React, { createContext, useContext, useState, useEffect } from 'react'
import type { Category, Transaction, Budget, Account, User } from '@/types'
import { getCurrentMonth } from '@/lib/utils'

// Default seed categories per spec
const DEFAULT_CATEGORIES: Omit<Category, 'created_by_id'>[] = [
  { id: 'cat-1', name: 'Salary', type: 'income', color: '#10b981', icon: 'Briefcase' },
  { id: 'cat-2', name: 'Freelance & Business', type: 'income', color: '#06b6d4', icon: 'Laptop' },
  { id: 'cat-3', name: 'Investments', type: 'income', color: '#8b5cf6', icon: 'TrendingUp' },
  { id: 'cat-4', name: 'Groceries & Food', type: 'expense', color: '#f59e0b', icon: 'ShoppingCart' },
  { id: 'cat-5', name: 'Rent & Housing', type: 'expense', color: '#ef4444', icon: 'Home' },
  { id: 'cat-6', name: 'Utilities & Internet', type: 'expense', color: '#ec4899', icon: 'Zap' },
  { id: 'cat-7', name: 'Transport & Fuel', type: 'expense', color: '#6366f1', icon: 'Car' },
  { id: 'cat-8', name: 'Entertainment & Leisure', type: 'expense', color: '#14b8a6', icon: 'Film' },
  { id: 'cat-9', name: 'Healthcare', type: 'expense', color: '#f43f5e', icon: 'HeartPulse' },
]

interface ToastMessage {
  id: string
  title: string
  description?: string
  type?: 'success' | 'error' | 'info' | 'warning'
}

interface FinanceContextType {
  currentUser: User
  setCurrentUser: (user: User) => void
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  accounts: Account[]
  toasts: ToastMessage[]
  addToast: (title: string, description?: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  removeToast: (id: string) => void
  // Categories CRUD
  addCategory: (cat: Omit<Category, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>) => Category
  updateCategory: (id: string, cat: Partial<Category>) => void
  deleteCategory: (id: string) => { success: boolean; error?: string }
  // Transactions CRUD
  addTransaction: (tx: Omit<Transaction, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>) => void
  updateTransaction: (id: string, tx: Partial<Transaction>) => void
  deleteTransaction: (id: string) => void
  // Budgets CRUD
  addBudget: (b: Omit<Budget, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>) => { success: boolean; error?: string }
  updateBudget: (id: string, b: Partial<Budget>) => void
  deleteBudget: (id: string) => void
  // Accounts CRUD
  addAccount: (acc: Omit<Account, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>) => void
  updateAccount: (id: string, acc: Partial<Account>) => void
  deleteAccount: (id: string) => void
  // Batch Excel Import
  batchImport: (data: { transactions: Omit<Transaction, 'id' | 'created_by_id'>[]; budgets: Omit<Budget, 'id' | 'created_by_id'>[] }) => void
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)

const DEFAULT_USER: User = {
  id: 'usr_main_01',
  name: 'Demo Finance User',
  email: 'user@walletwise.app',
}

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('walletwise_active_user')
    return saved ? JSON.parse(saved) : DEFAULT_USER
  })

  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = (title: string, description?: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, title, description, type }])
    setTimeout(() => {
      removeToast(id)
    }, 4000)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Load user-scoped storage key
  const storageKey = (entity: string) => `walletwise_${currentUser.id}_${entity}`

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem(storageKey('categories'))
    if (saved) return JSON.parse(saved)
    return DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }))
  })

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem(storageKey('transactions'))
    if (saved) return JSON.parse(saved)
    // Starter initial data so app has lively graphs for demonstration
    const curMonth = getCurrentMonth()
    return [
      {
        id: 'tx-1',
        date: `${curMonth}-02`,
        amount: 3200,
        description: 'Monthly Salary Deposit',
        category_id: 'cat-1',
        category_name: 'Salary',
        type: 'income',
        is_recurring: true,
        notes: 'Main payroll',
        created_by_id: currentUser.id,
      },
      {
        id: 'tx-2',
        date: `${curMonth}-04`,
        amount: 850,
        description: 'Monthly Apartment Rent',
        category_id: 'cat-5',
        category_name: 'Rent & Housing',
        type: 'expense',
        is_recurring: true,
        notes: 'Direct transfer',
        created_by_id: currentUser.id,
      },
      {
        id: 'tx-3',
        date: `${curMonth}-07`,
        amount: 320,
        description: 'Weekly Supermarket Run',
        category_id: 'cat-4',
        category_name: 'Groceries & Food',
        type: 'expense',
        is_recurring: false,
        notes: 'Produce and pantry',
        created_by_id: currentUser.id,
      },
      {
        id: 'tx-4',
        date: `${curMonth}-10`,
        amount: 140,
        description: 'Fiber Internet Bill',
        category_id: 'cat-6',
        category_name: 'Utilities & Internet',
        type: 'expense',
        is_recurring: true,
        notes: 'Monthly high-speed subscription',
        created_by_id: currentUser.id,
      },
      {
        id: 'tx-5',
        date: `${curMonth}-14`,
        amount: 450,
        description: 'Freelance Design Consulting',
        category_id: 'cat-2',
        category_name: 'Freelance & Business',
        type: 'income',
        is_recurring: false,
        notes: 'Landing page audit',
        created_by_id: currentUser.id,
      },
      {
        id: 'tx-6',
        date: `${curMonth}-18`,
        amount: 95,
        description: 'Fuel & Commute',
        category_id: 'cat-7',
        category_name: 'Transport & Fuel',
        type: 'expense',
        is_recurring: false,
        notes: 'Fuel station refill',
        created_by_id: currentUser.id,
      },
    ]
  })

  const [budgets, setBudgets] = useState<Budget[]>(() => {
    const saved = localStorage.getItem(storageKey('budgets'))
    if (saved) return JSON.parse(saved)
    const curMonth = getCurrentMonth()
    return [
      {
        id: 'bg-1',
        month: curMonth,
        category_id: 'cat-4',
        category_name: 'Groceries & Food',
        planned_amount: 600,
        notes: 'Monthly food allocation',
        created_by_id: currentUser.id,
      },
      {
        id: 'bg-2',
        month: curMonth,
        category_id: 'cat-5',
        category_name: 'Rent & Housing',
        planned_amount: 900,
        notes: 'Rent cap',
        created_by_id: currentUser.id,
      },
      {
        id: 'bg-3',
        month: curMonth,
        category_id: 'cat-6',
        category_name: 'Utilities & Internet',
        planned_amount: 200,
        notes: 'Electricity + fiber',
        created_by_id: currentUser.id,
      },
      {
        id: 'bg-4',
        month: curMonth,
        category_id: 'cat-7',
        category_name: 'Transport & Fuel',
        planned_amount: 250,
        notes: 'Fuel estimate',
        created_by_id: currentUser.id,
      },
    ]
  })

  const [accounts, setAccounts] = useState<Account[]>(() => {
    const saved = localStorage.getItem(storageKey('accounts'))
    if (saved) return JSON.parse(saved)
    return [
      {
        id: 'acc-1',
        name: 'Main Checking Account',
        type: 'bank',
        institution: 'FNB Commercial',
        account_number: '•••• 4921',
        balance: 4250.75,
        color: '#4f46e5',
        is_active: true,
        created_by_id: currentUser.id,
      },
      {
        id: 'acc-2',
        name: 'Emergency Savings',
        type: 'bank',
        institution: 'Standard Bank',
        account_number: '•••• 8812',
        balance: 12500.0,
        color: '#10b981',
        is_active: true,
        created_by_id: currentUser.id,
      },
      {
        id: 'acc-3',
        name: 'Airtel Money Daily',
        type: 'mobile_wallet',
        institution: 'Airtel Money',
        account_number: '•••• 0914',
        balance: 850.5,
        color: '#f59e0b',
        is_active: true,
        created_by_id: currentUser.id,
      },
      {
        id: 'acc-4',
        name: 'Physical Cash Wallet',
        type: 'cash',
        institution: 'Personal Cash',
        account_number: 'N/A',
        balance: 320.0,
        color: '#8b5cf6',
        is_active: true,
        created_by_id: currentUser.id,
      },
    ]
  })

  // Persist state when changes happen
  useEffect(() => {
    localStorage.setItem(storageKey('categories'), JSON.stringify(categories))
  }, [categories, currentUser.id])

  useEffect(() => {
    localStorage.setItem(storageKey('transactions'), JSON.stringify(transactions))
  }, [transactions, currentUser.id])

  useEffect(() => {
    localStorage.setItem(storageKey('budgets'), JSON.stringify(budgets))
  }, [budgets, currentUser.id])

  useEffect(() => {
    localStorage.setItem(storageKey('accounts'), JSON.stringify(accounts))
  }, [accounts, currentUser.id])

  // Category Actions
  const addCategory = (cat: Omit<Category, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>): Category => {
    const newCat: Category = {
      ...cat,
      id: `cat-${Date.now()}`,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }
    setCategories((prev) => [...prev, newCat])
    addToast('Category created', `"${cat.name}" has been added.`, 'success')
    return newCat
  }

  const updateCategory = (id: string, updated: Partial<Category>) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated, updated_date: new Date().toISOString() } : c))
    )
    addToast('Category updated', 'Category details were updated successfully.', 'success')
  }

  const deleteCategory = (id: string): { success: boolean; error?: string } => {
    const hasTransactions = transactions.some((t) => t.category_id === id)
    if (hasTransactions) {
      addToast('Cannot delete category', 'Transactions are currently linked to this category.', 'error')
      return { success: false, error: 'Category is in use by transactions' }
    }
    setCategories((prev) => prev.filter((c) => c.id !== id))
    addToast('Category removed', 'Category was deleted.', 'info')
    return { success: true }
  }

  // Transaction Actions
  const addTransaction = (tx: Omit<Transaction, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>) => {
    const newTx: Transaction = {
      ...tx,
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }
    setTransactions((prev) => [newTx, ...prev])
    addToast('Transaction recorded', `${tx.type === 'income' ? '+' : '-'}${tx.amount} for ${tx.description || tx.category_name}`, 'success')
  }

  const updateTransaction = (id: string, tx: Partial<Transaction>) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...tx, updated_date: new Date().toISOString() } : t))
    )
    addToast('Transaction updated', 'Changes have been saved.', 'success')
  }

  const deleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id))
    addToast('Transaction deleted', 'Record was removed.', 'info')
  }

  // Budget Actions
  const addBudget = (b: Omit<Budget, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>): { success: boolean; error?: string } => {
    const exists = budgets.some((item) => item.month === b.month && item.category_id === b.category_id)
    if (exists) {
      addToast('Duplicate budget', 'A budget already exists for this category in this month.', 'error')
      return { success: false, error: 'A budget already exists for this category in this month' }
    }
    const newBudget: Budget = {
      ...b,
      id: `bg-${Date.now()}`,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }
    setBudgets((prev) => [...prev, newBudget])
    addToast('Budget created', `Planned budget of ${b.planned_amount} for ${b.category_name}`, 'success')
    return { success: true }
  }

  const updateBudget = (id: string, b: Partial<Budget>) => {
    setBudgets((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...b, updated_date: new Date().toISOString() } : item))
    )
    addToast('Budget updated', 'Planned amount updated successfully.', 'success')
  }

  const deleteBudget = (id: string) => {
    setBudgets((prev) => prev.filter((item) => item.id !== id))
    addToast('Budget deleted', 'Budget allocation removed.', 'info')
  }

  // Account Actions
  const addAccount = (acc: Omit<Account, 'id' | 'created_by_id' | 'created_date' | 'updated_date'>) => {
    const newAcc: Account = {
      ...acc,
      id: `acc-${Date.now()}`,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }
    setAccounts((prev) => [...prev, newAcc])
    addToast('Account created', `Added "${acc.name}"`, 'success')
  }

  const updateAccount = (id: string, acc: Partial<Account>) => {
    setAccounts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...acc, updated_date: new Date().toISOString() } : item))
    )
    addToast('Account updated', 'Account details saved.', 'success')
  }

  const deleteAccount = (id: string) => {
    setAccounts((prev) => prev.filter((item) => item.id !== id))
    addToast('Account removed', 'Account deleted successfully.', 'info')
  }

  // Batch Excel Import
  const batchImport = (data: {
    transactions: Omit<Transaction, 'id' | 'created_by_id'>[]
    budgets: Omit<Budget, 'id' | 'created_by_id'>[]
  }) => {
    const newTxList = data.transactions.map((tx) => ({
      ...tx,
      id: `tx-import-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }))

    const newBgList = data.budgets.map((bg) => ({
      ...bg,
      id: `bg-import-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_by_id: currentUser.id,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    }))

    setTransactions((prev) => [...newTxList, ...prev])
    setBudgets((prev) => [...newBgList, ...prev])
    addToast(
      'Import completed',
      `Imported ${newTxList.length} transactions and ${newBgList.length} budgets.`,
      'success'
    )
  }

  return (
    <FinanceContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        categories,
        transactions,
        budgets,
        accounts,
        toasts,
        addToast,
        removeToast,
        addCategory,
        updateCategory,
        deleteCategory,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addBudget,
        updateBudget,
        deleteBudget,
        addAccount,
        updateAccount,
        deleteAccount,
        batchImport,
      }}
    >
      {children}
    </FinanceContext.Provider>
  )
}

export const useFinance = () => {
  const context = useContext(FinanceContext)
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider')
  }
  return context
}
