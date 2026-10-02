import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { IS_DEV } from '@/lib/env'

interface ErrorBoundaryState {
  error: Error | null
  componentStack: string
}

/**
 * Last line of defence for render-time crashes.
 *
 * Without this, any throw during render unmounts the whole React tree and the
 * user gets a blank white page with no way forward — including the deliberate
 * `throw` in `useFinance()` when it is called outside its provider. A boundary
 * turns that dead end into a recoverable state with a retry.
 *
 * Environment split:
 *  - production: a short, generic message plus Reload. The stack can quote
 *    source paths and module internals, so it never reaches a user (SECURITY.md §7).
 *  - development: the message, the stack, and the component stack, so the
 *    failure is diagnosable without a debugger.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Always log: the Worker logs only cover the API, and this is a client-side
    // failure that would otherwise vanish.
    console.error('[walletwise] render error', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  private handleReset = (): void => {
    this.setState({ error: null, componentStack: '' })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): React.ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 font-sans"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        role="alert"
      >
        <div className="w-full max-w-lg">
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--danger)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" style={{ color: 'var(--danger)' }} />
              <h1 className="text-base font-semibold">Something went wrong</h1>
            </div>

            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {IS_DEV
                ? error.message || 'An unexpected error occurred.'
                : 'The app hit an unexpected error. Reload to continue — your data is safe.'}
            </p>

            {/* Diagnostics are development-only; a stack trace must never be
                shown to an end user (SECURITY.md §7). */}
            {IS_DEV && (
              <pre
                className="mt-4 p-3 rounded-xl text-xs overflow-auto max-h-56"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {error.stack || error.message}
                {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
              </pre>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--bg-surface-3)', color: 'var(--text-primary)' }}
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'var(--bg-surface-3)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}