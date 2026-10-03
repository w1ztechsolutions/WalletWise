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
import { formatCurrency } from '@/lib/utils'
import { describeApiError } from '@/lib/api'
import { useAccounts, useAddAccount, useUpdateAccount, useDeleteAccount } from '@/hooks/useAccounts'
import { useCurrency } from '@/hooks/useUser'
import { useFinance } from '@/context/FinanceContext'
import type { Account, AccountType } from '@/types'

const PRESET_INSTITUTIONS: Record<AccountType, string[]> = {
  bank: ['FNB', 'Standard Bank', 'Absa', 'Barclays', 'Chase', 'Bank of America'],
  mobile_wallet: ['Airtel Money', 'MTN Mobile Money', 'M-Pesa', 'EcoCash', 'PayPal', 'Venmo'],
  cash: ['Cash on Hand', 'Safe Vault', 'Petty Cash', 'Physical Wallet'],
}

const PRESET_COLORS = ['#4f46e5', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b']

export const AccountsView: React.FC = () => {
  const { addToast } = useFinance()
  const currency = useCurrency()
  const { data: accounts = [], isPending: isLoading } = useAccounts()
  const { mutate: createAccount, isPending: isCreating } = useAddAccount()
  const { mutate: saveAccount, isPending: isUpdating } = useUpdateAccount()
  const { mutate: removeAccount } = useDeleteAccount()

  const [activeTab, setActiveTab] = useState<'all' | AccountType>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formData, setFormData] = useState<{
    name: string
    type: AccountType
    institution: string
    account_number: string
    opening_balance: string
    color: string
    notes: string
    is_active: boolean
  }>({
    name: '',
    type: 'bank',
    institution: 'FNB',
    account_number: '',
    opening_balance: '',
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
      opening_balance: '',
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
      opening_balance: String(acc.opening_balance),
      color: acc.color,
      notes: acc.notes || '',
      is_active: acc.is_active,
    })
    setIsModalOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const openingBalance = parseFloat(formData.opening_balance) || 0

    // Mask account number if user typed plain digits (preserve only last 4)
    let masked = formData.account_number.trim()
    if (masked.length > 4 && !masked.includes('•')) {
      masked = `•••• ${masked.slice(-4)}`
    } else if (!masked) {
      masked = 'N/A'
    }

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      institution: formData.institution.trim(),
      account_number: masked,
      opening_balance: openingBalance,
      color: formData.color,
      notes: formData.notes.trim(),
      is_active: formData.is_active,
    }

    const onError = (err: unknown) => {
      addToast(
        'Unable to save account',
        describeApiError(
          err,
          'Your form is still open. Check Accounts before retrying if you are unsure whether it saved.'
        ),
        'error'
      )
    }
    const onSuccess = () => {
      addToast(
        editingAccount ? 'Account updated' : 'Account created',
        editingAccount ? 'Account details saved.' : `Added "${payload.name}"`,
        'success'
      )
      setIsModalOpen(false)
      resetForm()
    }

    if (editingAccount) {
      saveAccount(
        { id: editingAccount.id, ...payload },
        { onSuccess, onError }
      )
    } else {
      createAccount(payload, { onSuccess, onError })
    }
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
      {/* Loading placeholder so the net-worth header never flashes a fake 0 */}
      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-10 rounded-3xl bg-surface border border-hairline">
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin border-gold" />
          <span className="text-xs text-muted">Loading your accounts…</span>
        </div>
      )}

      {/* Net Worth Summary Header */}
      <div className="rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden bg-gradient-to-br from-surface-2 via-surface to-ink border border-hairline border-t-2 border-t-gold/60">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-gold">
              Total Net Worth (Active Accounts)
            </span>
            <p className="text-platinum text-3xl sm:text-4xl font-extrabold mt-1 tracking-tight">
              {formatCurrency(totals.totalNetWorth, currency)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 md:pt-0 border-t border-hairline md:border-t-0 md:border-l md:pl-8">
            <div>
              <span className="text-[11px] text-muted">Bank Accounts</span>
              <p className="text-platinum text-sm sm:text-base font-bold mt-0.5">{formatCurrency(totals.bankTotal, currency)}</p>
            </div>
            <div>
              <span className="text-[11px] text-muted">Mobile Money</span>
              <p className="text-platinum text-sm sm:text-base font-bold mt-0.5">{formatCurrency(totals.mobileTotal, currency)}</p>
            </div>
            <div>
              <span className="text-[11px] text-muted">Cash</span>
              <p className="text-platinum text-sm sm:text-base font-bold mt-0.5">{formatCurrency(totals.cashTotal, currency)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Add Account button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-surface-2 rounded-2xl overflow-x-auto">
          {(['all', 'bank', 'mobile_wallet', 'cash'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl capitalize whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-surface text-platinum shadow-card'
                  : 'text-muted hover:text-platinum'
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
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gold hover:bg-gold-hover text-ink shadow-gold text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      {/* Account Cards Grid */}
      {filteredAccounts.length === 0 ? (
        <div className="bg-surface rounded-2xl p-12 border border-hairline text-center">
          <WalletCards className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-platinum">
            No accounts in this category
          </h3>
          <p className="text-xs text-muted mt-1">
            Add bank accounts, mobile wallets, or cash reserves to track your full portfolio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-surface rounded-2xl p-5 border border-hairline shadow-card relative overflow-hidden group hover:shadow-md transition-all"
            >
              {/* Color Accent Pill */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: acc.color }}
              />

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-card"
                    style={{ backgroundColor: acc.color }}
                  >
                    {getTypeIcon(acc.type)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-platinum">
                      {acc.name}
                    </h4>
                    <p className="text-xs text-muted">{acc.institution || 'Personal'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(acc)}
                    className="p-1.5 text-muted hover:text-indigo rounded-lg hover:bg-surface-3"
                    title="Edit account"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingId(acc.id)}
                    className="p-1.5 text-muted hover:text-danger rounded-lg hover:bg-danger/10"
                    title="Delete account"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black text-platinum tracking-tight">
                  {formatCurrency(acc.balance, currency)}
                </span>
                <span className="text-xs font-mono text-muted">
                  {acc.account_number}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between text-xs">
                <span className="capitalize text-muted font-medium">
                  {acc.type.replace('_', ' ')}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    acc.is_active ? 'text-success' : 'text-muted'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-hairline">
            <div className="flex items-center justify-between pb-4 border-b border-hairline">
              <h3 className="text-base font-bold text-platinum">
                {editingAccount ? 'Edit Account' : 'Add Financial Account'}
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
              {/* Account Type */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
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
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-hairline text-muted hover:bg-surface-3'
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
                  <label className="block text-xs font-medium text-muted mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Daily Checking"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Opening Balance *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.opening_balance}
                    onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Current balance includes linked income and expenses.
                  </p>
                </div>
              </div>

              {/* Institution with Preset Suggestions */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Institution / Provider
                </label>
                <input
                  type="text"
                  placeholder="e.g. FNB, Standard Bank, MTN"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo mb-1.5"
                />
                <div className="flex flex-wrap gap-1">
                  {PRESET_INSTITUTIONS[formData.type].map((inst) => (
                    <button
                      key={inst}
                      type="button"
                      onClick={() => setFormData({ ...formData, institution: inst })}
                      className="px-2 py-0.5 text-[11px] rounded-lg bg-surface-3 text-muted hover:bg-gold/10 hover:text-gold transition-colors"
                    >
                      {inst}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Number (Masked) */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Account Number (Last 4 digits or ref)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-surface-3 border border-hairline text-platinum focus:outline-none focus:ring-2 focus:ring-indigo"
                />
                <p className="text-[10px] text-muted mt-1">
                  Per security guidelines, full account numbers are never stored.
                </p>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Card Theme Color
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        formData.color === color ? 'scale-125 ring-2 ring-gold ring-offset-2 ring-offset-surface' : ''
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
                  className="w-4 h-4 rounded text-indigo focus:ring-indigo border-hairline"
                />
                <label htmlFor="acc_active" className="text-xs font-medium text-muted">
                  Active (Include in Net Worth calculations)
                </label>
              </div>

              {/* Form Buttons */}
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
                  disabled={isCreating || isUpdating}
                  className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl disabled:opacity-60 disabled:cursor-wait"
                >
                  {isCreating || isUpdating
                    ? 'Saving…'
                    : editingAccount
                      ? 'Update Account'
                      : 'Create Account'}
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
              Delete Account?
            </h4>
            <p className="text-xs text-muted mt-2">
              This account will be removed. Linked transactions will remain, but become unlinked.
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
                  removeAccount(deletingId, {
                    onSuccess: () => addToast('Account removed', 'Account deleted successfully.', 'info'),
                    onError: (err: unknown) =>
                      addToast(
                        'Unable to remove account',
                        err instanceof Error ? err.message : 'Please try again.',
                        'error'
                      ),
                  })
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
