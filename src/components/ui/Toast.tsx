import React from 'react'
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'

const TOAST_ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
  warning: AlertTriangle,
}

const TOAST_COLORS: Record<string, { border: string; icon: string; glow: string }> = {
  success: {
    border: 'rgba(34, 197, 94, 0.4)',
    icon:   '#22C55E',
    glow:   'rgba(34, 197, 94, 0.1)',
  },
  error: {
    border: 'rgba(239, 68, 68, 0.4)',
    icon:   '#EF4444',
    glow:   'rgba(239, 68, 68, 0.1)',
  },
  info: {
    border: 'rgba(79, 70, 229, 0.4)',
    icon:   '#4F46E5',
    glow:   'rgba(79, 70, 229, 0.1)',
  },
  warning: {
    border: 'rgba(245, 158, 11, 0.4)',
    icon:   '#F59E0B',
    glow:   'rgba(245, 158, 11, 0.1)',
  },
}

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useFinance()

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 sm:w-96"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          title={toast.title}
          description={toast.description}
          type={toast.type ?? 'info'}
          onRemove={removeToast}
        />
      ))}
    </div>
  )
}

interface ToastProps {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  onRemove: (id: string) => void
}

const Toast: React.FC<ToastProps> = ({ id, title, message, type, onRemove }) => {
  const Icon = TOAST_ICONS[type]
  const colors = TOAST_COLORS[type]

  useEffect(() => {
    const timer = setTimeout(() => onRemove(id), 5000)
    return () => clearTimeout(timer)
  }, [id, onRemove])

  return (
    <div
      className="relative flex items-start gap-3 p-4 rounded-2xl animate-fade-slide-up"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${colors.border}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${colors.border}`,
        background: `linear-gradient(135deg, var(--bg-surface) 0%, ${colors.glow} 100%)`,
      }}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: colors.icon }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      </div>
      <button
        onClick={() => onRemove(id)}
        className="shrink-0 p-0.5 rounded-lg transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
