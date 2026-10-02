import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { User } from '@/types'
import { useSession } from '@/hooks/useSession'

interface ToastMessage {
  id: string
  title: string
  description?: string
  type?: 'success' | 'error' | 'info' | 'warning'
}

/**
 * Owns exactly two concerns: the transient toast queue and the identity of the
 * signed-in user.
 *
 * Finance data deliberately lives *here no more* — it is served by D1 through
 * the React Query hooks in `src/hooks/` so that every screen, the dashboard and
 * analytics all observe one cache instead of three copies. This provider also
 * stays mounted outside `AuthGate` because a signed-out user still needs toasts.
 */
interface FinanceContextType {
  /** Session identity, or `null` when anonymous. */
  currentUser: User | null
  toasts: ToastMessage[]
  addToast: (title: string, description?: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  removeToast: (id: string) => void
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)

const TOAST_TTL_MS = 4000

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useSession()

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const addToast = useCallback(
    (title: string, description?: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
      const id = Math.random().toString(36).substring(2, 9)
      setToasts((prev) => [...prev, { id, title, description, type }])
      timers.current.set(
        id,
        setTimeout(() => removeToast(id), TOAST_TTL_MS)
      )
    },
    [removeToast]
  )

  const currentUser = useMemo<User | null>(
    () =>
      user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar_url: user.image ?? undefined,
          }
        : null,
    [user]
  )

  const value = useMemo<FinanceContextType>(
    () => ({ currentUser, toasts, addToast, removeToast }),
    [currentUser, toasts, addToast, removeToast]
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export const useFinance = () => {
  const context = useContext(FinanceContext)
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider')
  }
  return context
}