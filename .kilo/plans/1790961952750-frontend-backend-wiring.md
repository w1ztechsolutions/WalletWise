# Wire the Frontend to the Cloudflare Backend

## Goal

WalletWise's backend is built, working, and completely unused. The app renders an
unauthenticated shell backed by `localStorage` demo data, while every real endpoint sits
behind a middleware that returns `401` because no code path can ever create a session.

This plan adds the missing auth UI and moves the frontend onto React Query + D1. After it,
signing up creates a real session, all data lives in D1, and the Excel/AI import does a
review-then-commit instead of a blind write.

## Verified starting state

Checked before planning; treat these as facts, not assumptions.

- `npm run build` passes (`tsc -b && vite build`, 2522 modules, 3.45s, zero TS errors).
- Backend is proven working: `docs/bugsnfix/BUG-004-deprecated-workers-ai-model.md` records
  a live `wrangler pages dev` run against real Workers AI returning `source: "ai"`, which
  required a valid session. Better Auth + `_middleware.ts` + the API layer work.
- `src/hooks/` has 5 complete, well-formed hooks (`useTransactions`, `useAccounts`,
  `useBudgets`, `useCategories`, `useUser`) with **zero importers** — dead code.
- `main.tsx:11` mounts `QueryClientProvider`; nothing consumes it.
- `src/context/FinanceContext.tsx` is 473 lines mixing three concerns: toasts, a
  `localStorage` data store, and a fake user.
- No auth UI exists. `Sidebar.tsx:35-39` `handleSignOut` only overwrites a context object
  with a synthetic guest — it terminates nothing.
- `src/db/schema.ts:47` has unique index `budget_user_month_category_idx` on
  `(created_by_id, month, category_id)`. Transactions have **no** unique constraint.
- `functions/api/user/me.ts` GET and PATCH both return `currency`.
- `functions/api/analytics/index.ts` serves `overview`, `monthly`, `all-time`, but no
  `useAnalytics` hook wraps it.
- No signup category seeding exists anywhere in `functions/`.
- `docs/bugsnfix/README.md:15` indexes `BUG-003-pages-functions-and-better-auth-startup.md`;
  that file does not exist on disk.
- `.smoke-cookies.txt` is untracked, not gitignored, and contains a live
  `better-auth.session_token`.
- `wrangler.jsonc` has `database_id: "local-walletwise-db"`, a placeholder that will fail a
  real deploy.

## Decisions

| # | Decision |
| :-- | :-- |
| D1 | Delete the `localStorage` + demo-data layer entirely. D1 is the single source of truth. |
| D2 | Add `POST /api/import` with a preview-then-commit flow; duplicates are surfaced for the user to skip or replace. |
| D3 | Duplicate transaction key = `created_by_id + date + amount + type + category_id + lower(trim(description))`. Budgets use the existing unique index. |
| D4 | Signed-out state is a full-screen `AuthGate` view. No router added. |
| D5 | Email/password only. Social login deferred. |

## Critical constraint: the client must never import server code

`src/lib/auth.ts` imports `drizzle-orm/d1` and `src/db/schema.ts`. Importing it from the Vite
client bundle will break the build and ship D1 types to the browser. The client needs its own
module. Any task that touches auth must create `src/lib/auth-client.ts` and must not add an
`@/lib/auth` import to anything under a component.

---

## Phase A — Hygiene (do first)

1. Add to `.gitignore`: `.smoke-cookies.txt`, `.build-out.txt`, `.pagesdev-out.txt`,
   `.pbuild.txt`, `.pbuild-test.mjs`, `.tsc-baseline.txt`.
2. Delete `.smoke-cookies.txt`. Clear local `.wrangler` state so the exposed local session
   token is dead.
3. Commit the currently uncommitted backend (`functions/`, `drizzle/0001_*`, `src/hooks/`,
   `src/lib/api.ts`, `src/lib/auth.ts`) as a checkpoint. State in the message that the hooks
   are not yet consumed — do not present it as a finished feature.
4. Resolve the broken `BUG-003` row in `docs/bugsnfix/README.md` — restore the file or drop
   the row.

## Phase B — Auth UI (critical path)

1. `src/lib/auth-client.ts` — Better Auth **client** via `createAuthClient`, `baseURL:
   "/api/auth"`. Must not import server modules (see constraint above).
2. `src/hooks/useSession.ts` — `useQuery` on `authClient.getSession()` with `retry: false`.
   Distinguish three states: loading, authenticated (render app), anonymous (render auth).
3. `src/components/auth/AuthView.tsx` — full-screen centered card, sign-in / create-account
   toggle, email + password fields, inline error text, disabled+pending button state.
4. `src/components/auth/AuthGate.tsx` — loading spinner, anonymous → `AuthView`, otherwise
   `children`.
5. `App.tsx` restructure. **`ToastContainer` must move out of `AppContent` and above
   `AuthGate`**, otherwise auth errors raised while signed out have nowhere to render. Keep
   `FinanceProvider` outside the gate for the same reason.
6. `Sidebar.tsx:35-39` — replace the fake `handleSignOut` with
   `authClient.signOut()` → `queryClient.clear()` → toast.
7. `FinanceContext` — stop reading `walletwise_active_user` from `localStorage`; derive
   `currentUser` from the session. Remove `DEFAULT_USER` and the `setCurrentUser` guest path.
8. Unauthorized handling — in `src/lib/api.ts`, when a response is `401`, dispatch a
   `walletwise:unauthorized` window event before throwing. `AuthGate` listens and signs out.
   This avoids relying on per-hook retry configuration to suppress 401 storms.

## Phase C — React Query migration

1. Add `src/hooks/useAnalytics.ts` wrapping `/api/analytics`, keyed `["analytics", view]`.
2. Gut `FinanceContext.tsx` (473 → roughly 120 lines): keep `toasts`, `addToast`,
   `removeToast`, `currentUser`. Delete `DEFAULT_CATEGORIES`, the four data `useState`
   blocks, the four `localStorage` persistence effects (lines 276-290), all twelve CRUD
   functions, `batchImport`, and `DEFAULT_USER`.
3. Migrate views in this order, largest first. For each: swap `useFinance()` data for hooks,
   swap synchronous CRUD for mutations, keep `addToast`, and preserve existing empty and
   error states.
   1. `SettingsView` — categories + the import flow (rewritten in Phase D)
   2. `TransactionsView` — also holds receipt upload/download via `apiFetch`
   3. `AccountsView`
   4. `BudgetsView`
   5. `DashboardView` — `useAnalytics("overview")`
   6. `AnalyticsView` — `useAnalytics("all-time")` + `useAnalytics("monthly")`
   7. `Sidebar` / `Navbar` — `currentUser` from session
   8. `Toast.tsx` — no change, already toast-only
4. **Preserve rules the API does not enforce.** Neither of these is server-side today:
   - *Category in use guard* (`FinanceContext.tsx:313-322`) — keep the client-side check
     against the transactions list and keep the existing error toast.
   - *Duplicate budget* (`FinanceContext.tsx:351-358`) — the DB unique index will fire, but
     confirm `functions/api/budgets/index.ts` maps that constraint to a `409` with a readable
     message. If it does not, add the mapping so the UI can show the existing duplicate toast.
5. Currency threading — add a `useCurrency()` helper over `useUser()` and pass
   `user.currency` into every `formatCurrency` call across all six views. Without this, the
   Phase 6.1 preference silently does nothing.

## Phase D — Import review flow

1. New `functions/api/import/index.ts`, `POST`, two modes.

   **`?mode=preview`** — validate every row, classify, persist nothing. Returns:
   ```
   {
     inserted: { transactions: n, budgets: n },
     duplicates: {
       transactions: [{ incoming, existing }],
       budgets:     [{ incoming, existing }]
     },
     invalid: [{ row, entity, reason }]
   }
   ```
   Matching per D3. Budgets match on the existing unique index.

   **`?mode=commit`** — accepts `{ transactions, budgets, skip, replace }`. `replace` updates
   the matched row **in place, keeping its existing `id`**, so nothing is orphaned. Invalid
   rows are skipped rather than failing the batch.

   Reuse the row validation already in `functions/api/transactions/index.ts` (`YYYY-MM-DD`
   regex, `amount > 0`, `type` enum) so preview and single-create cannot drift.
2. New `useBulkImport` hook wrapping both phases and invalidating
   `transactionKeys.all` / `budgetKeys.all` on commit.
3. `SettingsView` — after the AI parse returns, call `preview` and render a review modal
   listing each duplicate side-by-side with per-row Skip / Replace controls, then commit.
   Replace the `batchImport(...)` call at `SettingsView.tsx:284`.

## Phase E — Signup seeding

Seed the nine `DEFAULT_CATEGORIES` from `FinanceContext.tsx:6-16` into D1 on first signup,
via a Better Auth `databaseHooks.user.create.after` handler, with `created_by_id` set to the
new user. Must be idempotent.

## Phase F — Documentation

1. Rewrite the Phase 6 checkboxes in `PLAN.md` to match reality. `6.5` and `6.6` currently
   claim `[x]` for integration that has never run behind a real session.
2. New bug doc for this condition (dead hooks + unwired backend), following the
   `BUG-XXX-short-description.md` template, and add its row to the index.
3. ADR recording the `better-auth-cloudflare` substitution for the `@better-auth/d1-adapter`
   named in `PLAN.md` §1, and for the `[[all]].ts` catch-all naming.

## Phase G — Deploy (requires your Cloudflare access)

1. Create the real D1 database; replace `database_id: "local-walletwise-db"` in
   `wrangler.jsonc`.
2. Apply `r2-cors.json` to the bucket.
3. `wrangler secret put` for `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` (see `.dev.vars.example`).
4. Apply migrations `--local` then `--remote`; push `main`.

---

## Risks

- **Client/server module bleed** — the highest-risk item. Any `@/lib/auth` import from a
  component breaks the Vite build. Phase B step 1 exists purely to prevent this.
- **401 retry storms** — five hooks firing before the session resolves. Mitigated by the
  event-based handler in Phase B step 8 plus `retry: false` on `useSession`.
- **Duplicate-budget 409 not mapped** — Phase C step 4 must confirm before the toast can be
  shown; otherwise the user sees a raw constraint error.
- **Import atomicity vs. D1 limits** — large sheets may exceed per-request write limits.
  Decide during implementation whether `mode=commit` should chunk, and cap preview input.
- **Toast placement** — easy to leave `ToastContainer` inside the gated shell by accident,
  silently breaking signed-out error reporting.

## Validation

- `npm run build` passes after every phase.
- Sign up → session cookie set → reload → still authenticated.
- Signed-out `GET /api/transactions` returns `401`.
- Sign out → cookie cleared → `queryClient` empty → gated view returns.
- Two separate users see zero data from each other.
- Create a transaction → appears in Dashboard and Analytics after invalidation.
- Import a sheet with a known duplicate → preview reports it → Replace updates in place with
  the original row id, Skip omits it.
- `grep -r localStorage src/` returns nothing.
- `grep -r "from '@/hooks" src/components` shows every hook imported.
- `.smoke-cookies.txt` absent from `git status`.

## Out of scope

Social login (D5), email verification, password reset, avatar upload, and per-row import
editing beyond skip/replace.