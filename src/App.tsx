import React, { useState, useEffect } from 'react'
import { FinanceProvider } from '@/context/FinanceContext'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar, type NavTab } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { ToastContainer } from '@/components/ui/Toast'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { TransactionsView } from '@/components/transactions/TransactionsView'
import { AccountsView } from '@/components/accounts/AccountsView'
import { BudgetsView } from '@/components/budgets/BudgetsView'
import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { SettingsView } from '@/components/settings/SettingsView'

function AppContent() {
  // Sync tab with URL hash if present
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const hash = window.location.hash.replace('#', '') as NavTab
    const validTabs: NavTab[] = ['dashboard', 'transactions', 'accounts', 'budgets', 'analytics', 'settings']
    return validTabs.includes(hash) ? hash : 'dashboard'
  })

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAddTxModalOpen, setIsAddTxModalOpen] = useState(false)

  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab)
    window.location.hash = tab
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as NavTab
      const validTabs: NavTab[] = ['dashboard', 'transactions', 'accounts', 'budgets', 'analytics', 'settings']
      if (validTabs.includes(hash)) {
        setActiveTab(hash)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Toast notifications */}
      <ToastContainer />

      {/* Top Navbar */}
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        activeTab={activeTab}
        onOpenAddModal={() => {
          if (activeTab === 'transactions') {
            setIsAddTxModalOpen(true)
          } else {
            handleSelectTab('transactions')
            setIsAddTxModalOpen(true)
          }
        }}
      />

      {/* Slide-in Sidebar with dark backdrop */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigateTab={handleSelectTab}
            onOpenAddTransaction={() => {
              handleSelectTab('transactions')
              setIsAddTxModalOpen(true)
            }}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            isAddModalOpen={isAddTxModalOpen}
            setIsAddModalOpen={setIsAddTxModalOpen}
          />
        )}
        {activeTab === 'accounts' && <AccountsView />}
        {activeTab === 'budgets' && <BudgetsView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Fixed Bottom Navigation Bar for Mobile */}
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} />
    </div>
  )
}

export default function App() {
  return (
    <FinanceProvider>
      <AppContent />
    </FinanceProvider>
  )
}
