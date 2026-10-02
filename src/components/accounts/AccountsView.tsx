import React, { useState, useMemo } from 'react'
import {
  WalletCards,
  Landmark,
  Smartphone,
  Banknote,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  CreditCard,
} from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency } from '@/lib/utils'
import type { Account, AccountType } from '@/types'

const PRESET_INSTITUTIONS: Record<AccountType, string[]> = {
  bank: ['FNB', 'Standard Bank', 'Absa', 'Barclays', 'Chase', 'Bank of America'],
  mobile_wallet: ['Airtel Money', 'MTN Mobile Money', 'M-Pesa', 'EcoCash', 'PayPal', 'Venmo'],
  cash: ['Cash on Hand', 'Safe Vault', 'Petty Cash', 'Physical Wallet'],
}

const PRESET_COLORS = ['#4f46e5', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b']

export const AccountsView: React.FC = () => {
  const { accounts, addAccount, updateAccount, deleteAccount } = useFinance()

  const [activeTab, setActiveTab] = useState<'all' | AccountType>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formData, setFormData] = useState<{
    name: string
    type: AccountType
    institution: string
    account_number: string
    balance: string
    color: string
    notes: string
    is_active: boolean
  }>({
    name: '',
    type: 'bank',
    institution: 'FNB',
    account_number: '',
    balance: '',
    color: PRESET_COLORS[0],
    notes: '',
    is_active: true,
  })

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'bank',
      institution: 'FNB',
      account_number: '',
      balance: '',
      color: PRESET_COLORS[0],
      notes: '',
      is_active: true,
    })
    setEditingAccount(null)
  }

  const openEdit = (acc: Account) => {
    setEditingAccount(acc)
    setFormData({
      name: acc.name,
      type: acc.type,
      institution: acc.institution,
      account_number: acc.account_number,
      balance: String(acc.balance),
      color: acc.color,
      notes: acc.notes || '',
      is_active: acc.is_active,
    })
    setIsModalOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const bal = parseFloat(formData.balance) || 0

    // Mask account number if user typed plain digits (preserve only last 4)
    let masked = formData.account_number.trim()
    if (masked.length > 4 && !masked.includes('•')) {
      masked = `•••• ${masked.slice(-4)}`
    } else if (!masked) {
      masked = 'N/A'
    }

    if (editingAccount) {
      updateAccount(editingAccount.id, {
        name: formData.name.trim(),
        type: formData.type,
        institution: formData.institution.trim(),
        account_number: masked,
        balance: bal,
        color: formData.color,
        notes: formData.notes.trim(),
        is_active: formData.is_active,
      })
    } else {
      addAccount({
        name: formData.name.trim(),
        type: formData.type,
        institution: formData.institution.trim(),
        account_number: masked,
        balance: bal,
        color: formData.color,
        notes: formData.notes.trim(),
        is_active: formData.is_active,
      })
    }

    setIsModalOpen(false)
    resetForm()
  }

  // Totals calculations
  const totals = useMemo(() => {
    let totalNetWorth = 0
    let bankTotal = 0
    let mobileTotal = 0
    let cashTotal = 0

    accounts.forEach((acc) => {
      if (acc.is_active) {
        totalNetWorth += acc.balance
        if (acc.type === 'bank') bankTotal += acc.balance
        else if (acc.type === 'mobile_wallet') mobileTotal += acc.balance
        else if (acc.type === 'cash') cashTotal += acc.balance
      }
    })

    return { totalNetWorth, bankTotal, mobileTotal, cashTotal }
  }, [accounts])

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    if (activeTab === 'all') return accounts
    return accounts.filter((a) => a.type === activeTab)
  }, [accounts, activeTab])

  const getTypeIcon = (type: AccountType) => {
    switch (type) {
      case 'bank':
        return <Landmark className="w-5 h-5" />
      case 'mobile_wallet':
        return <Smartphone className="w-5 h-5" />
      case 'cash':
        return <Banknote className="w-5 h-5" />
    }
  }

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Net Worth Summary Header */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-indigo-300">
              Total Net Worth (Active Accounts)
            </span>
            <p className="text-3xl sm:text-4xl font-extrabold mt-1 tracking-tight">
              {formatCurrency(totals.totalNetWorth)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 md:pt-0 border-t border-indigo-800/50 md:border-t-0 md:border-l md:pl-8">
            <div>
              <span className="text-[11px] text-indigo-300">Bank Accounts</span>
              <p className="text-sm sm:text-base font-bold mt-0.5">{formatCurrency(totals.bankTotal)}</p>
            </div>
            <div>
              <span className="text-[11px] text-indigo-300">Mobile Money</span>
              <p className="text-sm sm:text-base font-bold mt-0.5">{formatCurrency(totals.mobileTotal)}</p>
            </div>
            <div>
              <span className="text-[11px] text-indigo-300">Cash</span>
              <p className="text-sm sm:text-base font-bold mt-0.5">{formatCurrency(totals.cashTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Add Account button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl overflow-x-auto">
          {(['all', 'bank', 'mobile_wallet', 'cash'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl capitalize whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'all' ? 'All Accounts' : tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            resetForm()
            setIsModalOpen(true)
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      {/* Account Cards Grid */}
      {filteredAccounts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200/80 dark:border-slate-800 text-center">
          <WalletCards className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No accounts in this category
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Add bank accounts, mobile wallets, or cash reserves to track your full portfolio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all"
            >
              {/* Color Accent Pill */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: acc.color }}
              />

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: acc.color }}
                  >
                    {getTypeIcon(acc.type)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {acc.name}
                    </h4>
                    <p className="text-xs text-slate-400">{acc.institution || 'Personal'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(acc)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Edit account"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingId(acc.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                    title="Delete account"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
                  {formatCurrency(acc.balance)}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {acc.account_number}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="capitalize text-slate-500 font-medium">
                  {acc.type.replace('_', ' ')}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    acc.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {acc.is_active ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" />
                      <span>Inactive</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Account Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingAccount ? 'Edit Account' : 'Add Financial Account'}
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
              {/* Account Type */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account Type *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bank', 'mobile_wallet', 'cash'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          type: t,
                          institution: PRESET_INSTITUTIONS[t][0] || '',
                        })
                      }
                      className={`py-2 px-1 text-xs font-semibold rounded-xl border flex flex-col items-center gap-1 transition-all ${
                        formData.type === t
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {getTypeIcon(t)}
                      <span className="capitalize">{t.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Name & Balance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Daily Checking"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Current Balance *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Institution with Preset Suggestions */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Institution / Provider
                </label>
                <input
                  type="text"
                  placeholder="e.g. FNB, Standard Bank, MTN"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-1.5"
                />
                <div className="flex flex-wrap gap-1">
                  {PRESET_INSTITUTIONS[formData.type].map((inst) => (
                    <button
                      key={inst}
                      type="button"
                      onClick={() => setFormData({ ...formData, institution: inst })}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      {inst}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Number (Masked) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account Number (Last 4 digits or ref)
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="•••• 4821"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Per security guidelines, full account numbers are never stored.
                </p>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Card Theme Color
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        formData.color === color ? 'scale-125 ring-2 ring-indigo-500 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="acc_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <label htmlFor="acc_active" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Active (Include in Net Worth calculations)
                </label>
              </div>

              {/* Form Buttons */}
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
                  {editingAccount ? 'Update Account' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Delete Account?
            </h4>
            <p className="text-xs text-slate-500 mt-2">
              This account will be permanently removed from your active net worth portfolio.
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
                  deleteAccount(deletingId)
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
