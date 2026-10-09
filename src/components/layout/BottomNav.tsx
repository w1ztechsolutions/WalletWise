import React from 'react'
import { LayoutDashboard, Receipt, WalletCards, PiggyBank, BarChart3, Settings, ArrowLeftRight } from 'lucide-react'
import type { NavTab } from './Sidebar'

interface BottomNavProps {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard',    label: 'Home',    icon: LayoutDashboard },
  { id: 'transactions', label: 'Records', icon: Receipt },
  { id: 'accounts',     label: 'Wallets', icon: WalletCards },
  { id: 'transfers',    label: 'Move',    icon: ArrowLeftRight },
  { id: 'budgets',      label: 'Budgets', icon: PiggyBank },
  { id: 'analytics',    label: 'Charts',  icon: BarChart3 },
  { id: 'settings',     label: 'Settings',icon: Settings },
]

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => (
  <nav
    className="fixed bottom-0 inset-x-0 z-30 sm:hidden"
    style={{
      backgroundColor: 'rgba(26, 26, 36, 0.95)',
      backdropFilter: 'blur(16px)',
      borderTop: '1px solid var(--border)',
    }}
  >
    <div className="grid grid-cols-7 h-16">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = activeTab === item.id
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className="flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
            aria-label={item.label}
          >
            <div
              className={`p-1.5 rounded-xl transition-all ${isActive ? 'scale-110' : ''}`}
              style={{
                backgroundColor: isActive ? 'var(--accent-gold-subtle)' : 'transparent',
                color: isActive ? 'var(--accent-gold)' : 'var(--text-disabled)',
              }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: isActive ? 'var(--accent-gold)' : 'var(--text-disabled)' }}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  </nav>
)
