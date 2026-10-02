import React from 'react'
import { Menu, Plus, Moon, Sun, UserCircle } from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import type { NavTab } from './Sidebar'

interface NavbarProps {
  onOpenSidebar: () => void
  activeTab: NavTab
  onOpenAddModal?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSidebar, activeTab, onOpenAddModal }) => {
  const { currentUser } = useFinance()
  const [isDark, setIsDark] = React.useState(() => {
    return document.documentElement.classList.contains('dark')
  })

  const toggleDarkMode = () => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const titles: Record<NavTab, string> = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    accounts: 'Accounts & Wallets',
    budgets: 'Budgets & Planning',
    analytics: 'Financial Analytics',
    settings: 'Settings & Data',
  }

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Hamburger menu + Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="p-2 -ml-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
            aria-label="Open navigation sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-indigo-600 dark:text-indigo-400 hidden sm:inline">
                WalletWise
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                {titles[activeTab]}
              </h1>
            </div>
          </div>
        </div>

        {/* Right: Quick actions & Dark toggle & User pill */}
        <div className="flex items-center gap-2">
          {onOpenAddModal && (
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Record</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}

          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div
            onClick={onOpenSidebar}
            className="cursor-pointer flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
