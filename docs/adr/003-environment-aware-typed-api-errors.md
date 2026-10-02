# ADR-003: Environment-Aware Typed API Error Contract

- **Status:** Accepted
- **Date:** 2026-10-02

---

## Context

The API's error behavior had three gaps:

1. **Information-leakage risk (SECURITY.md §7).** Every handler built
   its own `Response` for failures; nothing prevented a future
   `error(err.message, 500)` from writing a D1 error text, stack
   trace, or internal path into an HTTP response. The rule existed
   only in a document, not in the code.
2. **Opaque failures.** Pages Functions expose no `onError` hook. An
   exception escaping a handler (or `context.next()` in middleware)
   surfaces as Cloudflare's HTML 500 page, which the client's
   `apiFetch` cannot parse — the user sees "Request failed with
   status 500" and nothing reaches the Worker log.
3. **Lost error identity.** `apiFetch` discarded the HTTP status and
   the response body into a bare `Error`, so React Query retried
   permanent 4xx failures like transient network blips, and the UI
   could not distinguish "bad input" from "dead session".

The two runtimes also demand different verbosity: a developer on
`wrangler pages dev` needs the real diagnostic; a production user
must never see it.

## Decision

Introduce a single error module, `functions/lib/errors.ts`, that all
API code routes through:

- **`ApiError`** — carries a safe `message` (shown everywhere) plus
  an optional `details` field (the real diagnostic) and a stable
  machine-readable `code` (`BAD_REQUEST`, `UNAUTHORIZED`,
  `CONFLICT`, …).
- **Environment-aware serialization.** `toResponse()` includes
  `details` **only** when `ENVIRONMENT` is exactly `"development"`.
  `isProduction()` fails *closed*: a missing, misspelled, or empty
  `ENVIRONMENT` behaves as production, so misconfiguration can leak
  nothing. The same rule is mirrored client-side via
  `__WW_ENVIRONMENT__` (injected by `vite.config.ts` `define`).
- **`handleUnexpectedError()`** — the single entry point for anything
  escaping a handler: logs the full diagnostic as one structured JSON
  line (level, event, code, status, message, requestId) in **every**
  environment, returns the sanitized envelope.
- **`withErrorHandling()`** — wraps each Pages Function handler;
  `functions/_middleware.ts` applies the same guard around
  `context.next()` as the outermost net and mints a per-request
  `requestId` echoed into every log line.
- **Client mirror (`src/lib/api.ts`).** `ApiError` preserves
  status/code/details; `useRetry()` refuses to retry 4xx (except
  network-level status `0`), so permanent failures surface
  immediately.

The legacy `error(message, status)` helper in `functions/lib/helpers.ts`
delegates to `ApiError.fromStatus()`, so all existing call sites keep
their already-sanitized copy while gaining the `code` field.

## Consequences

**Pros**

- SECURITY.md §7 becomes enforceable in code: leaking requires
  deliberately bypassing the module, and even then `details` is
  stripped in production.
- Failures are identifiable (status + code) by both UI and React
  Query; no more retry storms on 400/401/404/409.
- Every unhandled exception reaches the Worker log as a structured
  line with a `requestId` a user can quote.
- One name (`ENVIRONMENT`) decides verbosity on both sides of the
  wire; `grep ENVIRONMENT` finds every decision point.

**Cons**

- Error responses carry an extra `code` field (additive; existing
  clients reading `error` are unaffected).
- Two markers must stay in sync (the `ENVIRONMENT` Pages var and the
  `__WW_ENVIRONMENT__` build define) — documented in
  `.dev.vars.example` and `wrangler.jsonc`.
- Handlers must opt in via `withErrorHandling`; the middleware net
  catches anything forgotten, but with one less precise context.

**Alternatives rejected**

- *Per-endpoint try/catch with ad-hoc logging*: 30+ duplications of
  the same fail-closed logic, each a future §7 violation waiting to
  happen.
- *Always-verbose errors behind a "dev mode" cookie*: cookies are
  client-controllable; a build-time/runtime env marker is not.
- *A middleware-only net*: leaves handler-level context (which query
  failed) unavailable to logs.
