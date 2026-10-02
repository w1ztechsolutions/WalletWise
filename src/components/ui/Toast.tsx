import React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useFinance } from '@/context/FinanceContext'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useFinance()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success'
        const isError = toast.type === 'error'
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-2 ${
              isError
                ? 'bg-red-50/95 border-red-200 text-red-900 dark:bg-red-950/90 dark:border-red-800 dark:text-red-200'
                : isSuccess
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-200'
                : 'bg-indigo-50/95 border-indigo-200 text-indigo-900 dark:bg-indigo-950/90 dark:border-indigo-800 dark:text-indigo-200'
            }`}
          >
            {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
            {isError && <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
            {!isSuccess && !isError && <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && <p className="text-xs opacity-90 mt-0.5">{toast.description}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
