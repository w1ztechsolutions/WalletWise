import React from 'react'
import { Menu, Plus } from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'
import type { NavTab } from './Sidebar'

interface NavbarProps {
  onOpenSidebar: () => void
  activeTab: NavTab
  onOpenAddModal?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSidebar, activeTab, onOpenAddModal }) => {
  const { currentUser } = useFinance()

  const titles: Record<NavTab, string> = {
    dashboard:    'Dashboard',
    transactions: 'Transactions',
    accounts:     'Accounts & Wallets',
    budgets:      'Budgets & Planning',
    analytics:    'Financial Analytics',
    settings:     'Settings & Data',
  }

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        backgroundColor: 'rgba(18, 18, 18, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

        {/* Left: Hamburger + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="p-2 -ml-2 rounded-xl transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Open navigation sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold brand-title hidden sm:inline">WalletWise</span>
            <span className="hidden sm:inline" style={{ color: 'var(--border-strong)' }}>/</span>
            <h1 className="text-base sm:text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {titles[activeTab]}
            </h1>
          </div>
        </div>

        {/* Right: Add button + user avatar */}
        <div className="flex items-center gap-2">
          {onOpenAddModal && (
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: 'var(--accent-gold)',
                color: '#000',
                boxShadow: 'var(--shadow-gold)',
              }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Record</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}

          <button
            onClick={onOpenSidebar}
            className="flex items-center gap-2 pl-2 transition-opacity hover:opacity-80"
            style={{ borderLeft: '1px solid var(--border)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', color: '#000' }}
            >
              {(currentUser?.name ?? 'Guest').charAt(0).toUpperCase()}
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}
