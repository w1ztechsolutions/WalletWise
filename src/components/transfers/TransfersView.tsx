import React, { useMemo, useState } from 'react'
import { ArrowLeftRight, Plus, Edit2, Trash2, X } from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAccounts } from '@/hooks/useAccounts'
import { useCurrency } from '@/hooks/useUser'
import { useAddTransfer, useDeleteTransfer, useTransfers, useUpdateTransfer } from '@/hooks/useTransfers'
import type { Transfer } from '@/types'

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  boxShadow: 'var(--shadow-card)',
}

const todayISO = () => new Date().toISOString().split('T')[0]

export const TransfersView: React.FC = () => {
  const { addToast } = useFinance()
  const currency = useCurrency()
  const { data: accounts = [], isPending: isLoadingAccounts } = useAccounts()
  const { data: transfers = [], isPending: isLoadingTransfers } = useTransfers()
  const { mutate: createTransfer, isPending: isCreating } = useAddTransfer()
  const { mutate: saveTransfer, isPending: isUpdating } = useUpdateTransfer()
  const { mutate: removeTransfer } = useDeleteTransfer()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    date: todayISO(),
    description: '',
    notes: '',
  })

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name]))
    return (id: string | null) => (id ? map.get(id) ?? 'Deleted account' : 'Deleted account')
  }, [accounts])

  const resetForm = () => {
    setFormData({
      from_account_id: '',
      to_account_id: '',
      amount: '',
      date: todayISO(),
      description: '',
      notes: '',
    })
    setEditingTransfer(null)
  }

  const openEdit = (t: Transfer) => {
    setEditingTransfer(t)
    setFormData({
      from_account_id: t.from_account_id ?? '',
      to_account_id: t.to_account_id ?? '',
      amount: String(t.amount),
      date: t.date,
      description: t.description ?? '',
      notes: t.notes ?? '',
    })
    setIsModalOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(formData.amount)
    if (!formData.from_account_id || !formData.to_account_id) {
      addToast('Select accounts', 'Choose both a source and a destination account.', 'error')
      return
    }
    if (formData.from_account_id === formData.to_account_id) {
      addToast('Same account', 'Source and destination accounts must differ.', 'error')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('Invalid amount', 'Enter an amount greater than zero.', 'error')
      return
    }
    const payload = {
      from_account_id: formData.from_account_id,
      to_account_id: formData.to_account_id,
      amount,
      date: formData.date,
      description: formData.description.trim(),
      notes: formData.notes.trim() || null,
    }
    const done = {
      onSuccess: () => {
        addToast(editingTransfer ? 'Transfer updated' : 'Transfer recorded', 'Balances were adjusted accordingly.', 'success')
        setIsModalOpen(false)
        resetForm()
      },
      onError: (err: unknown) =>
        addToast('Unable to save transfer', err instanceof Error ? err.message : 'Please try again.', 'error'),
    }
    if (editingTransfer) saveTransfer({ id: editingTransfer.id, ...payload }, done)
    else createTransfer(payload, done)
  }

  const isLoading = isLoadingAccounts || isLoadingTransfers



  return (
    <div className="space-y-5 pb-20 md:pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Move funds between accounts</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Transfers adjust both balances and are never counted as income or expense.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true) }}
          disabled={accounts.length < 2}
          title={accounts.length < 2 ? 'You need at least two accounts to transfer funds.' : undefined}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-gold)', color: '#000', boxShadow: 'var(--shadow-gold)' }}
        >
          <Plus className="w-4 h-4" />
          New Transfer
        </button>
      </div>

      {accounts.length < 2 && (
        <div className="p-4 rounded-2xl text-xs" style={{ ...CARD_STYLE, color: 'var(--text-secondary)' }}>
          You need at least two accounts before you can record a transfer.
        </div>
      )}

      <div className="p-5 rounded-2xl" style={CARD_STYLE}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Transfer History</h3>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block" />
            Loading transfers…
          </div>
        ) : transfers.length === 0 ? (
          <div className="py-10 text-center">
            <ArrowLeftRight className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No transfers yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Move funds between two of your accounts to see it here.</p>
          </div>
        ) : (
          <div className="space-y-0" style={{ borderTop: '1px solid var(--border)' }}>
            {transfers.map((t) => (
              <div key={t.id} className="py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-gold-subtle)', color: 'var(--accent-gold)' }}>
                    <ArrowLeftRight className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {accountName(t.from_account_id)} → {accountName(t.to_account_id)}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                      {t.description || 'Transfer'} · {formatDate(t.date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(t.amount, currency)}
                  </span>
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-surface-3" aria-label="Edit transfer" style={{ color: 'var(--text-secondary)' }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeletingId(t.id)} className="p-1.5 rounded-lg hover:bg-surface-3" aria-label="Delete transfer" style={{ color: 'var(--danger)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl max-w-md w-full p-5 shadow-2xl border border-hairline max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-platinum">{editingTransfer ? 'Edit Transfer' : 'New Transfer'}</h3>
              <button onClick={() => { setIsModalOpen(false); resetForm() }} aria-label="Close" className="p-1.5 rounded-lg hover:bg-surface-3 text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted">From</span>
                  <select value={formData.from_account_id} onChange={(e) => setFormData({ ...formData, from_account_id: e.target.value })} required
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm bg-surface-3 border border-hairline text-platinum">
                    <option value="">Select…</option>
                    {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">To</span>
                  <select value={formData.to_account_id} onChange={(e) => setFormData({ ...formData, to_account_id: e.target.value })} required
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm bg-surface-3 border border-hairline text-platinum">
                    <option value="">Select…</option>
                    {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Amount</span>
                  <input type="number" min="0.01" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm bg-surface-3 border border-hairline text-platinum" placeholder="0.00" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Date</span>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm bg-surface-3 border border-hairline text-platinum" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-muted">Description</span>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl text-sm bg-surface-3 border border-hairline text-platinum" placeholder="e.g. Monthly savings sweep" />
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm() }} className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl">
                  Cancel
                </button>
                <button type="submit" disabled={isCreating || isUpdating} className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl disabled:opacity-60 disabled:cursor-wait">
                  {isCreating || isUpdating ? 'Saving…' : editingTransfer ? 'Save Changes' : 'Record Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-hairline text-center">
            <h4 className="text-base font-bold text-platinum">Delete Transfer?</h4>
            <p className="text-xs text-muted mt-2">Balances will be restored.</p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl">
                Cancel
              </button>
              <button
                onClick={() => {
                  removeTransfer(deletingId, {
                    onSuccess: () => addToast('Transfer deleted', 'Balances were restored.', 'info'),
                    onError: (err: unknown) =>
                      addToast('Unable to delete transfer', err instanceof Error ? err.message : 'Please try again.', 'error'),
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
