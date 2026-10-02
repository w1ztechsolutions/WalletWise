# BUG-005: Fully Built Backend Unreachable — Dead Hooks and Demo Data Behind a Missing Auth Gate

- **Date:** 2026-10-02
- **Severity:** High (entire backend non-functional from the browser, no user-visible error)
- **Component:** `src/context/FinanceContext.tsx`, `src/App.tsx`, `src/hooks/*`, `functions/_middleware.ts`
- **Status:** Resolved

---

## 1. Symptoms & Error Message

There was no error. Both halves of the project were independently green, which is
what made this hard to see:

- `npm run build` passed with zero errors.
- Every backend endpoint responded correctly under `curl` with a real session cookie —
  `/api/transactions` `201`, `/api/budgets` `409` on duplicates, `/api/analytics` `200`,
  and `BUG-004-deprecated-workers-ai-model.md` records live `source: "ai"` parsing.
- React Query hooks existed and type-checked in `src/hooks/`.

Yet loading the app in a browser showed **demo data**, and:

- There was no sign-in or sign-up screen anywhere in the UI.
- The application shell rendered unconditionally — no session gate.
- Every browser-side `fetch('/api/...')` returned **`401`**, because no session could be
  ever established; `functions/_middleware.ts` correctly rejected each one.
- The Sidebar **Sign Out** button was cosmetic: it did not end a session (none existed)
  and did not clear the query cache.
- The persisted state was `localStorage` demo fixtures, not D1.

---

## 2. Root Cause Analysis

The project had drifted into two independent halves that were never actually joined.

1. **The backend half was complete and only ever proven with `curl`.** Session handling,
   D1 CRUD, analytics aggregation, R2 signed URLs, and Workers AI parsing all worked —
   but every proof used a cookie obtained outside the browser. No browser flow had ever
   created a session.
2. **The frontend half was still the Phase 0 demo.** `FinanceContext.tsx` seeded
   `import.meta.env.DEV` demo data and read/wrote `localStorage`. The React Query hooks
   in `src/hooks/` were written but **imported by no component** — dead code.
3. **Nothing tracked the gap.** `PLAN.md` Phase 4 (React Query migration) was left as
   `[ ]` unchecked items, so the missing wiring was recorded as "not yet done" rather
   than "done and broken". The green build and green API tests were both true statements
   about code that never ran together.

The consequence was a silent coupling failure: **the app could not authenticate, so it
could not call the API, so the real backend was dead code at runtime.** The one missing
piece — a sign-in surface plus a session gate — was load-bearing for everything else.

This also made two integration items in `PLAN.md` overstate their status. Sub-phases 6.5
(R2 storage wired into `SettingsView` Excel upload and receipt attachments) and 6.6
(Workers AI spreadsheet parser) were marked `[x]` on the strength of the **endpoints**
existing. The frontend **integration** behind them had never executed against a live
session, so neither path had been proven end to end.

---

## 3. Resolution & Code Changes

### Session gate (the load-bearing fix)
- `src/lib/auth-client.ts` (new) — browser-only `createAuthClient` from
  `better-auth/react`. `baseURL` must be **absolute** (`${window.location.origin}/api/auth`);
  a relative `/api/auth` throws `Invalid base URL` before any request is made.
- `src/hooks/useSession.ts` (new) — three-state session query (loading /
  authenticated / anonymous) with `retry: false`, so the five data hooks do not fire
  before the session resolves and produce a retry storm of `401`s.
- `src/components/auth/AuthView.tsx`, `src/components/auth/AuthGate.tsx` (new) — sign-in /
  sign-up form and the gate that renders the shell only when authenticated.
- `src/App.tsx` — `ToastContainer` deliberately mounted **outside** `AuthGate` (and outside
  the gated shell) so signed-out errors stay visible instead of being swallowed.
- `src/lib/api.ts` — dispatches a `walletwise:unauthorized` event on any `401`;
  `AuthGate` listens, clears the cache, and signs out.
- `src/lib/auth.ts` — corrected cookie config. Session cookie naming must live under
  `advanced.cookies.session_token`; a top-level `cookie` block is **silently ignored** and
  leaves the cookie on Better Auth's default `better-auth.session_token`.
- `src/components/layout/Sidebar.tsx` — real `authClient.signOut()` + `queryClient.clear()`.

### Data layer
- `src/context/FinanceContext.tsx` — reduced to `addToast` + session-derived `currentUser`.
  All data methods and every `localStorage` access removed.
- `src/hooks/useAnalytics.ts` (new) — `useAnalytics(view)` for `overview` / `monthly` /
  `all-time`.
- `useUser` gained `useCurrency()`; currency threaded through all six views plus the import
  review modal.
- `useTransactions` / `useBudgets` mutations now invalidate the analytics keys as well as
  their own, so a new transaction updates Dashboard and Analytics without a reload.
- `functions/lib/validation.ts` (new) — shared validation plus the duplicate-identity keys,
  reused by the transaction and budget endpoints.

### Import review
- `functions/api/import/index.ts` (new) — `mode=preview` / `mode=commit`; defaults duplicate
  decisions to skip, preserves row IDs on replace, caps preview at 5,000 rows, chunks
  inserts at 50.
- `src/hooks/useBulkImport.ts`, `src/components/settings/ImportReviewModal.tsx` (new) —
  preview → per-row skip/replace → commit, replacing the previous blind `batchImport`.

### Signup seeding
- `src/lib/defaultCategories.ts` (new) and an idempotent
  `databaseHooks.user.create.after` handler in `src/lib/auth.ts` seed the nine default
  categories for the new user.

---

## 4. Verification

Live `wrangler pages dev dist` run, driving the real UI in a browser plus API smoke tests:

| Check | Result |
| --- | --- |
| `grep -r localStorage src/` | no matches |
| Signed-out `GET /api/transactions` | `401` |
| Sign up → session cookie set → reload | still authenticated |
| New user's category count | 9 |
| Sign out → cookie cleared → gated view returns | `200` then `401` |
| Two separate users | zero cross-user data leakage |
| Duplicate budget create | `409`, mapped to a toast (not a raw constraint error) |
| Import known duplicate | preview reports it; Replace keeps the original row id; Skip omits it |
| Create a transaction → Dashboard and Analytics after invalidation | no reload; `POST 201` → refetch of `/api/transactions`, `?view=overview`, `?view=monthly` |

The final row is the one this bug made impossible to claim. Driving the UI end to end
updated the Dashboard from `MWK 2,450.75` to `MWK 2,100.25` (86% savings, top category
`Groceries & Food`) purely from a client-side navigation, with the network log showing the
`201` followed by the three refetches.

One diagnostic worth recording: an early dashboard check read `MWK 0.00` while
`/api/analytics?view=overview` returned the correct `2450.75` in the same page. The cause
was the snapshot being read before React Query settled on load, not a data defect — after
waiting for settle, all five queries (`get-session`, `user/me`, both analytics views,
`categories`) returned `200` and the totals rendered correctly.
