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
  UserCircle,
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
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'accounts', label: 'Accounts', icon: WalletCards },
  { id: 'budgets', label: 'Budgets', icon: PiggyBank },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activeTab, onSelectTab }) => {
  const { currentUser, setCurrentUser, addToast } = useFinance()

  const handleSignOut = () => {
    // Multi-user switch demo / sign out
    addToast('Signed out', 'Session terminated. Switched to guest.', 'info')
    setCurrentUser({
      id: `usr_${Date.now()}`,
      name: 'Guest User',
      email: 'guest@walletwise.app',
    })
    onClose()
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            WalletWise
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-4 mx-4 mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-semibold text-sm shrink-0">
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {currentUser.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {currentUser.email}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id)
                  onClose()
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer with Sign Out */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
