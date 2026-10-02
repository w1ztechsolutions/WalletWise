# Path B: Cloudflare Fullstack Backend Implementation Plan

## Goal
Implement the full Cloudflare backend (Workers API, D1 via Drizzle, Better Auth, R2, Workers AI), migrate `FinanceContext` from localStorage to server state, and ensure MWK is the default currency with a user-changeable currency setting.

---

## Phase 0: Frontend Quick Fixes (do first, unblocks later)

1. **Fix Toast prop mismatch** in `src/components/ui/Toast.tsx`:
   - `ToastContainer` passes `message={toast.message}` but `ToastMessage` defines `description`.
   - Change to `description={toast.description}` and update inner `Toast` props accordingly.

2. **Consolidate Toast timers**:
   - Remove the `useEffect` auto-dismiss from `Toast.tsx`.
   - Keep only the context's `setTimeout` (4000ms) in `FinanceContext.tsx`.

3. **Unify styling in feature views**:
   - Replace hardcoded `bg-white dark:bg-slate-900` and standard slate classes in `TransactionsView`, `BudgetsView`, `AnalyticsView`, and `SettingsView` with the project's CSS variable tokens (`var(--bg-surface)`, `var(--text-primary)`, `var(--border)`, etc.) to match `DashboardView` and layout components.

4. **Gate demo seed data behind `import.meta.env.DEV`**:
   - In `FinanceContext.tsx`, wrap the hardcoded demo transactions/accounts/categories/budgets so they only load in development.

---

## Phase 1: Currency Preference

### Data Model
- Add `currency` column to Better Auth `user` table (text, default `'MWK'`).
- Extend the `User` type in `src/types/index.ts` with `currency?: string`.
- Update `formatCurrency` in `src/lib/utils.ts` to accept an optional `currency` parameter (default `'MWK'`).

### Settings UI
- Add a new **"Preferences"** sub-tab in `SettingsView.tsx` (alongside Categories, Import, Reports).
- Add a currency dropdown with common options: `MWK`, `USD`, `EUR`, `GBP`, `ZMW`, `ZAR`, `KES`, `NGN`, `INR`, `PHP`.
- Persist via `PATCH /api/user/me` endpoint.

---

## Phase 2: Better Auth on Cloudflare D1

1. **Install Better Auth:**
   - `npm install better-auth` and `npm install -D @better-auth/d1-adapter`.

2. **Create auth config:**
   - `src/lib/auth.ts` — configure Better Auth with D1 adapter, email/password provider, and `user.currency` field inclusion.

3. **Update Drizzle schema:**
   - Customize the Better Auth `user` table in `src/db/schema.ts` to include `currency: text('currency').default('MWK')`.

4. **Create Workers API handler:**
   - `functions/api/auth/[...all].ts` — mount Better Auth catch-all route.

5. **Create auth middleware:**
   - `functions/_middleware.ts` — verify session cookies, inject `userId` into request context, reject unauthenticated requests with `401`.

---

## Phase 3: Workers CRUD API Layer

Create the following endpoints, all using Drizzle ORM with `d1` prepared statements and strict `created_by_id` scoping:

### Transactions
- `GET /api/transactions` — list with optional filters (`type`, `category_id`, `month`, `search`)
- `POST /api/transactions` — create (server validates `amount > 0`, ISO date, trims strings)
- `GET /api/transactions/:id` — read (returns 404 if not owned)
- `PATCH /api/transactions/:id` — update (ownership check)
- `DELETE /api/transactions/:id` — delete (ownership check)

### Accounts
- `GET /api/accounts` — list
- `POST /api/accounts` — create (server masks account number to last 4 digits)
- `PATCH /api/accounts/:id` — update
- `DELETE /api/accounts/:id` — delete

### Budgets
- `GET /api/budgets` — list with optional `month` filter
- `POST /api/budgets` — create (enforce unique `(created_by_id, month, category_id)`)
- `PATCH /api/budgets/:id` — update
- `DELETE /api/budgets/:id` — delete

### Categories
- `GET /api/categories` — list
- `POST /api/categories` — create
- `PATCH /api/categories/:id` — update
- `DELETE /api/categories/:id` — delete (guard if transactions reference it)

### User
- `GET /api/user/me` — return current user including `currency`
- `PATCH /api/user/me` — update `currency` (validate against allowed codes)

All endpoints return sanitized errors (no stack traces, no DB internals).

---

## Phase 4: React Query Migration

1. **Create API client:**
   - `src/lib/api.ts` — thin wrapper around `fetch` with `credentials: 'include'` for cookies.
   - Centralized error handling with typed responses.

2. **Create React Query hooks:**
   - `src/hooks/useTransactions.ts`
   - `src/hooks/useAccounts.ts`
   - `src/hooks/useBudgets.ts`
   - `src/hooks/useCategories.ts`
   - `src/hooks/useUser.ts`

3. **Refactor `FinanceContext`:**
   - Replace `useState` + `localStorage` with React Query mutations (`useMutation`) and queries (`useQuery`).
   - On logout, call `queryClient.clear()` per SECURITY.md.
   - Keep `Toast` logic in context (UI concern), but data operations go through React Query.

4. **Update all views:**
   - Replace `useFinance` data reads with the new hooks.
   - Wire mutations to invalidate relevant query keys on success.

---

## Phase 5: R2 Storage Endpoints

1. **Presigned URL generators:**
   - `POST /api/storage/upload-url` — generate presigned PUT URL (15-min expiry, user-scoped path `users/:userId/:filename`)
   - `GET /api/storage/download-url` — generate presigned GET URL (15-min expiry, ownership check)

2. **Frontend integration:**
   - `SettingsView` Excel upload uses `POST /api/storage/upload-url` instead of client-side parse only.
   - Receipt attachments in transactions use R2 for storage.

---

## Phase 6: Workers AI Spreadsheet Parser

1. **Create endpoint:**
   - `POST /api/ai/parse-spreadsheet` — accept file upload (via R2 presigned PUT first), run Workers AI (`@cf/meta/llama-3.1-8b-instruct` or structured prompt), return normalized transactions/budgets.

2. **Frontend integration:**
   - `SettingsView` uploads to R2, calls AI endpoint, receives parsed data, confirms with user, then batch imports.

---

## Phase 7: Migrations, Testing, and Deploy

1. **Generate D1 migration:**
   - Run `drizzle-kit generate` after schema changes.
   - Apply locally with `wrangler d1 migrations apply walletwise-db --local`.
   - Apply remotely with `wrangler d1 migrations apply walletwise-db --remote`.

2. **Seed default categories:**
   - Insert default categories server-side on first user signup (or via migration seed).

3. **Local verification:**
   - Run `wrangler pages dev dist --compatibility-flag=nodejs_compat` to test full stack locally.
   - Verify auth, CRUD, currency setting, and file upload flows.

4. **Deploy:**
   - Push to GitHub.
   - Connect Cloudflare Pages.
   - Set production D1 database and R2 bucket bindings.
   - Run `wrangler secret put` for any required secrets.

---

## Open Decisions

1. **Better Auth user table customization:** Should `currency` live directly on the `user` table, or in a separate `user_preferences` table? **Recommended:** directly on `user` table (simpler, one less join, fits Better Auth's extensible user model).

2. **Currency picker scope:** Should the settings UI show all world currencies or a curated list? **Recommended:** curated list of ~10 common currencies relevant to the user base (MWK, USD, EUR, GBP, ZMW, ZAR, KES, NGN, INR, PHP) plus an "Other" option.

3. **Workers AI vs client-side parsing:** Should the AI parser be mandatory or optional fallback? **Recommended:** optional — client-side `xlsx` parsing remains as fast fallback; Workers AI is offered as "AI Enhanced" mode.
