import React from 'react'
import {
  LayoutDashboard,
  Receipt,
  WalletCards,
  PiggyBank,
  BarChart3,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'

export type NavTab = 'dashboard' | 'transactions' | 'accounts' | 'budgets' | 'analytics' | 'settings'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}

export const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'accounts',     label: 'Accounts',     icon: WalletCards },
  { id: 'budgets',      label: 'Budgets',      icon: PiggyBank },
  { id: 'analytics',    label: 'Analytics',    icon: BarChart3 },
  { id: 'settings',     label: 'Settings',     icon: Settings },
]

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activeTab, onSelectTab }) => {
  const { currentUser, setCurrentUser, addToast } = useFinance()

  const handleSignOut = () => {
    addToast('Signed out', 'Session terminated. Switched to guest.', 'info')
    setCurrentUser({ id: `usr_${Date.now()}`, name: 'Guest User', email: 'guest@walletwise.app' })
    onClose()
  }

  return (
    <>
      {/* Dark backdrop overlay */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          boxShadow: '4px 0 40px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header — WalletWise Branding */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', color: '#000' }}
            >
              W
            </div>
            <span className="text-lg font-bold brand-title">WalletWise</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div
          className="mx-4 mt-4 p-3 rounded-xl flex items-center gap-3"
          style={{ backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', color: '#000' }}
          >
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {currentUser.name}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {currentUser.email}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => { onSelectTab(item.id); onClose() }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--accent-gold-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid transparent',
                }}
              >
                <Icon className={`w-4 h-4 shrink-0`} />
                <span>{item.label}</span>
                {isActive && (
                  <div
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent-gold)' }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ color: 'var(--danger)' }}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
