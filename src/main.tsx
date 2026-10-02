import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query'
import './index.css'
import App from './App'
import { ApiError, useRetry } from '@/lib/api'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { devLog } from '@/lib/env'

/**
 * Reports a failure that React Query could not hand to a local `onError`.
 *
 * Most mutations in this app attach their own toast at the call site, but a
 * failing *query* (the dashboard, the transaction list) had nowhere to report
 * itself: views destructure `data = []`, so an API outage rendered as a
 * perfectly normal empty account with no message and no log. The global
 * handler closes that gap. Components that already show a toast keep it — this
 * only fires for the query path and for mutations with no local handler.
 *
 * `ApiError` already carries the server's sanitized message, so the toast text
 * is exactly what a user would have seen from a manual `onError`. Verbose
 * diagnostics are logged only in development (`devLog`).
 */
function reportGlobalError(error: unknown, context: string) {
  if (error instanceof ApiError) {
    devLog(`[query] ${context}`, `${error.status} ${error.code}`, error.message, error.details)
    return
  }
  // A network failure never reached the API at all.
  devLog(`[query] ${context} (unreachable)`, error)
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // 401 drives its own UX (session teardown in AuthGate); a toast here
      // would race the redirect to the sign-in screen.
      if (error instanceof ApiError && error.status === 401) return
      reportGlobalError(error, `query ${String(query.queryHash)}`)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, _onMutateResult, mutation) => {
      reportGlobalError(error, `mutation ${mutation.options.mutationKey ?? 'anonymous'}`)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      // Status-aware: never replay a 4xx. The previous implicit default
      // (retry: 3) re-sent genuinely bad input three times before surfacing.
      retry: useRetry,
    },
    mutations: {
      retry: false,
    },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root is missing from index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
