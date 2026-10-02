import React from 'react'
import { NAV_ITEMS, type NavTab } from './Sidebar'

interface BottomNavProps {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-6 h-16 items-center px-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center h-full transition-colors ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-indigo-50 dark:bg-indigo-950/60' : ''}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[48px]">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
