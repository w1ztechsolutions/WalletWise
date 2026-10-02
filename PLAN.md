# WalletWise — Implementation Plan & Roadmap

## 1. Executive Summary & Architecture

WalletWise is a modern, responsive personal finance management web application engineered for zero-cost, serverless deployment on the **Cloudflare Developer Platform**.

### Core Stack
- **Frontend:** React 19 (or 18), Vite, TypeScript, Tailwind CSS, Lucide React icons, and shadcn/ui design conventions.
- **Routing & State:** TanStack React Query for user-scoped cache management and optimistic mutations; client-side routing.
- **Backend / Edge API:** Cloudflare Workers / Pages Functions handling REST API endpoints.
- **Database & ORM:** Cloudflare D1 (Serverless SQL / SQLite) operated via Drizzle ORM (`drizzle-orm/d1`) with strict per-user data isolation.
- **Authentication:** Better Auth (running directly on D1 + Workers via Web Crypto API with secure HTTP-only cookies) supporting email/password and social login.
- **Object Storage:** Cloudflare R2 for user file uploads (receipts, Excel files) with private time-limited signed URLs ($0 egress).
- **AI Processing:** Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for intelligent spreadsheet parsing and transaction/budget extraction.
- **Hosting & CI/CD:** Cloudflare Pages with Git integration (push to GitHub `main` triggers automated build & deployment).

---

## 2. Directory Structure

```text
WalletWise/
├── AGENT.md                       # AI Agent & developer behavioral rules and documentation mandates
├── PLAN.md                        # Master architectural roadmap & step tracking
├── SECURITY.md                    # Strict multi-user security, RLS, and compliance rules
├── personal finance.txt           # Original requirements specification
├── wrangler.jsonc                 # Cloudflare configuration (D1, R2, Workers AI bindings)
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite build & proxy configuration
├── drizzle.config.ts              # Drizzle ORM configuration for D1
├── docs/                          # All secondary documentation
│   ├── adr/                       # Architectural Decision Records (ADR-001, ADR-002...)
│   │   ├── 001-cloudflare-fullstack-architecture.md
│   │   └── 002-better-auth-cloudflare-adapter-and-catch-all-routing.md
│   ├── bugsnfix/                  # Bug reports, incident logs, root causes, and fixes
│   │   ├── README.md              # Bug index (authoritative list)
│   │   └── BUG-0XX-*.md           # One file per bug, indexed in README.md
│   └── api/                       # API contracts and endpoint documentation
├── src/
│   ├── assets/                    # Static assets, logos, icons
│   ├── components/                # Reusable UI components (shadcn/ui style)
│   │   ├── layout/                # Sidebar, Mobile Bottom Nav, Header
│   │   ├── ui/                    # Button, Dialog, Input, Select, Progress, Tabs, Toast, etc.
│   │   ├── dashboard/             # Stat cards, Category Donut, Monthly Trend, Budget vs Actual
│   │   ├── transactions/          # Transaction list, filter bar, Add/Edit dialog
│   │   ├── accounts/              # Account cards, Net worth summary, Add/Edit dialog
│   │   ├── budgets/               # Budget cards, month picker, progress indicators
│   │   ├── analytics/             # Charts, monthly trends, spending breakdown
│   │   └── settings/              # Category management, Excel import modal, CSV export
│   ├── db/                        # Drizzle schema, migrations, and D1 connection
│   │   ├── schema.ts              # Categories, Transactions, Budgets, Accounts, Auth tables
│   │   └── index.ts
│   ├── hooks/                     # Custom React hooks (useAuth, useTransactions, useAccounts, etc.)
│   ├── lib/                       # Utilities (currency formatting, date helpers, cn classnames)
│   ├── types/                     # TypeScript definitions
│   └── App.tsx                    # Root application component
└── functions/                     # Cloudflare Pages Functions (Edge API)
    ├── api/
    │   ├── auth/                  # Better Auth endpoints
    │   ├── transactions/          # CRUD endpoints
    │   ├── accounts/              # CRUD endpoints
    │   ├── budgets/               # CRUD endpoints
    │   ├── categories/            # CRUD endpoints
    │   ├── analytics/             # Aggregation endpoints
    │   ├── storage/               # R2 signed URL generators
    │   └── ai/                    # Workers AI Excel sheet parser
    └── _middleware.ts             # Auth session verification and user-context injection
```

---

## 3. Data Entities & Schema

All records automatically include `id`, `created_date`, `updated_date`, and `created_by_id`.

1. **Category:**
   - `id` (text, primary key)
   - `created_by_id` (text, references user)
   - `name` (text, required)
   - `type` ('income' | 'expense', required)
   - `color` (text, hex code)
   - `icon` (text, Lucide icon name)

2. **Transaction:**
   - `id` (text, primary key)
   - `created_by_id` (text, references user)
   - `date` (text / ISO date, required)
   - `amount` (real / numeric, required, strictly > 0)
   - `description` (text)
   - `category_id` (text, references Category)
   - `category_name` (text, cached)
   - `type` ('income' | 'expense', required)
   - `is_recurring` (integer / boolean, default 0)
   - `notes` (text)

3. **Budget:**
   - `id` (text, primary key)
   - `created_by_id` (text, references user)
   - `month` (text, YYYY-MM format, required)
   - `category_id` (text, references Category)
   - `category_name` (text, cached)
   - `planned_amount` (real, required)
   - `notes` (text)
   - *Constraint:* Unique constraint on `(created_by_id, month, category_id)` to prevent duplicates.

4. **Account:**
   - `id` (text, primary key)
   - `created_by_id` (text, references user)
   - `name` (text, required)
   - `type` ('cash' | 'bank' | 'mobile_wallet', required)
   - `institution` (text)
   - `account_number` (text, masked - last 4 digits only)
   - `balance` (real, default 0)
   - `color` (text, hex color)
   - `notes` (text)
   - `is_active` (integer / boolean, default 1)

5. **Auth Tables (Managed by Better Auth on D1):**
   - `user` (id, name, email, emailVerified, image, createdAt, updatedAt)
   - `session` (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
   - `account` (id, accountId, providerId, userId, accessToken, refreshToken, password, etc.)
   - `verification` (id, identifier, value, expiresAt, createdAt, updatedAt)

---

## 4. Phase-by-Phase Roadmap

### Phase 1: Environment Setup, Documentation & Foundation
- [x] Create `PLAN.md`, `AGENT.md`, `SECURITY.md`.
- [x] Create `docs/adr/001-cloudflare-fullstack-architecture.md` and `docs/bugsnfix/README.md`.
- [x] Initialize Vite + React + TypeScript + Tailwind CSS in workspace root.
- [x] Install dependencies: `lucide-react`, `drizzle-orm`, `@tanstack/react-query`, `clsx`, `tailwind-merge`, `recharts`, `xlsx`, `wrangler`.
- [x] Configure `wrangler.jsonc` with D1, R2, and Workers AI bindings.
- [x] Configure Tailwind CSS design tokens (soft blue-grey background, indigo/violet primary, semantic colors).

### Phase 2: Database Schema, Migrations & Local D1 Emulation
- [x] Define Drizzle schema for categories, transactions, budgets, accounts, and auth.
- [x] Generated initial SQL migration (`drizzle/0000_glorious_franklin_richards.sql`).
- [x] Seed default categories and initial lively multi-user demo data.

### Phase 3: Core UI Shell & Design System
- [x] Implement responsive Layout shell:
  - Top header with hamburger button and page title.
  - Slide-in sidebar (with dark overlay) displaying app title, user info, navigation links, and Sign Out button.
  - Mobile fixed bottom navigation bar (6 items with icons and active highlights) with safe bottom padding.
- [x] Configure currency formatting utility (`formatCurrency`, user locale support).
- [x] Implement reusable components: Modal dialogs, buttons, inputs, tabs, stat cards, progress bars, toast notifications.

### Phase 4: Feature Modules
- [x] **Dashboard (`/`):**
  - Current month stat cards (Net Balance, Income, Expenses, Budget Score 0–100).
  - Spending by category donut chart.
  - 6-month Income vs Expenses trend bar chart.
  - Budget vs Actual progress list with over-budget alerts.
  - Recent transactions list (5 items) with empty states.
- [x] **Transactions (`/transactions`):**
  - Summary cards (income, expense, net).
  - Search + filters (type, category, month).
  - Grouped by date with color-coded badges, signed amounts, and hover edit/delete.
  - Add/Edit transaction dialog with positive amount validation.
- [x] **Accounts (`/accounts`):**
  - Net worth header with sub-totals (cash, bank, mobile wallet).
  - Tab filters + account cards with masked numbers and institution presets.
  - Add/Edit account dialog with color picker.
- [x] **Budgets (`/budgets`):**
  - Month navigation picker (prev/next).
  - Planned vs Actual summary cards and category progress bars.
  - Add/Edit budget dialog with duplicate prevention.
- [x] **Analytics (`/analytics`):**
  - All-time statistics (total income, expenses, net balance, savings rate).
  - Monthly income vs expenses trend charts.
  - Spending by category pie chart + top spending categories ranking.
- [x] **Settings (`/settings`):**
  - Category manager (income/expense categories with color dots & delete guard).
  - CSV templates download and export reports (CSV / JSON).
  - Excel file upload + spreadsheet parser & normalizer dialog.

### Phase 5: Testing, Local Verification & Deployment
- [x] Build validation (`npm run build` passes with zero errors).
- [x] Local server running at `http://127.0.0.1:5173/` (HTTP 200 OK verified).
- [x] Git repository initialized and commits recorded.
- [ ] Connect remote GitHub repository and push `main`.
 - [ ] Deploy to Cloudflare Pages & D1.

### Phase 6: Cloudflare Fullstack Backend Implementation

#### Phase 0: Frontend Quick Fixes
- [x] Fix `ToastContainer` prop mismatch: rename `message` → `description` in `Toast.tsx` and remove conflicting 5s `useEffect` timer from component. Context's 4s `setTimeout` is now the single dismissal authority.
- [x] ~~Gate demo seed data (`transactions`, `budgets`, `accounts`) behind `import.meta.env.DEV` in `FinanceContext.tsx` so production starts empty while preserving `localStorage` reads when present.~~ **Superseded:** `FinanceContext.tsx` no longer contains demo seed data or any `localStorage` access — it is now toasts + session-derived `currentUser` only. All views read from D1 via React Query. See `BUG-005`.
- [x] Verify feature-view styling (`TransactionsView`, `BudgetsView`, `AnalyticsView`, `SettingsView`, `AccountsView`) already uses CSS tokens (`bg-surface`, `text-platinum`, `border-hairline`); no mechanical refactor required.

#### Phase 1: Currency Preference (Data Model)
- [x] Update `formatCurrency` default from `'ZMW'` to `'MWK'` in `src/lib/utils.ts`.
- [x] Extend `User` type with `currency?: string` in `src/types/index.ts`.
- [x] Add `currency: text('currency').notNull().default('MWK')` to Better Auth `user` table in `src/db/schema.ts`.
- [ ] Add Preferences sub-tab and currency dropdown in `SettingsView.tsx`; persist via `PATCH /api/user/me`. **Still outstanding — now unblocked:** the API layer exists (`/api/user/me` GET/PATCH) and `useUser.ts` exports `useUpdateUser()`, but the dropdown UI is not built and `useUpdateUser` has no consumer. Currency is currently read-only in the UI via `useCurrency()` and threaded through every `formatCurrency` call.

#### Phase 2: Better Auth on Cloudflare D1
- [x] Install `better-auth` and `better-auth-cloudflare`. **Corrected:** the planned `@better-auth/d1-adapter` was **not** used — the existing Drizzle instance is passed through `better-auth-cloudflare`'s `withCloudflare` so the auth and application tables share one schema. Rationale in `ADR-002`.
- [x] Create `src/lib/auth.ts` with the D1/Drizzle adapter, email/password provider, and `user.currency` inclusion. (`geolocationTracking: false` — the `session` table has no geolocation columns; IP detection via `cf-connecting-ip` / `x-real-ip`.)
- [x] Create `functions/api/auth/[[all]].ts` mount point. Catch-all is `[[all]].ts`, **not** `[[...all]].ts` — wrangler rejects bracket-dots in parameter names.
- [x] Create `functions/_middleware.ts` to verify session cookies and inject `userId`; reject unauthenticated requests with `401`. Verified: signed-out `GET /api/transactions` returns `401`.

#### Phase 3: Workers CRUD API Layer
- [x] Implement transactions, accounts, budgets, categories, and user endpoints under `functions/api/`.
- [x] Enforce strict `created_by_id` scoping, input validation, and sanitized error responses. Shared validators and the duplicate-identity keys live in `functions/lib/validation.ts`; the budget unique-index violation is mapped to `409`.

#### Phase 4: React Query Migration
- [x] Create `src/lib/api.ts` fetch client with `credentials: 'include'`. Dispatches `walletwise:unauthorized` on `401`.
- [x] Create React Query hooks (`useTransactions`, `useAccounts`, `useBudgets`, `useCategories`, `useUser`), plus `useAnalytics`, `useSession`, and `useBulkImport`.
- [x] Refactor `FinanceContext` to delegate data operations to React Query; call `queryClient.clear()` on logout. Context is now toasts + session-derived `currentUser`; no data methods, no `localStorage`.
- [x] Update all views to use new hooks and invalidate relevant query keys on mutations. Transaction and budget mutations also invalidate the analytics keys, so a new record updates Dashboard and Analytics without a reload. **This phase was the gap that made the whole backend unreachable — see `BUG-005`.**

#### Phase 5: R2 Storage Endpoints
- [x] Implement presigned URL generators for upload (`POST`) and download (`GET`).
- [x] Integrate with `SettingsView` Excel upload and transaction receipt attachments. **Previously overclaimed** — this was `[x]` while the UI had no way to authenticate, so the integration had never executed behind a real session (`BUG-005`). Corrected status: the Excel path is now proven end to end against a live session (upload → `mode=preview` → duplicate review → `mode=commit`). The receipt attachment control is present but its upload round-trip has **not** been browser-verified.

#### Phase 6: Workers AI Spreadsheet Parser
- [x] Create `POST /api/ai/parse-spreadsheet` endpoint. Live `source: "ai"` results recorded in `BUG-004-deprecated-workers-ai-model.md`.
- [x] Wire Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) to normalize uploaded spreadsheets into transactions/budgets. **Previously overclaimed** for the same reason as Phase 5 — the parse call was proven at the endpoint level only. Corrected status: the parser is proven live, and the UI now reaches it behind a real session, but AI output reaching the import review modal has been exercised via the deterministic/API path rather than a browser upload of a messy sheet.

#### Phase 7: Migrations, Testing, and Deploy
- [ ] Run `drizzle-kit generate` and apply migrations (`--local` then `--remote`). **Partially done:** migrations are generated and `--local` is applied (`No migrations to apply!`). `--remote` requires a real D1 database ID.
- [x] Seed default categories server-side on first signup. Idempotent `databaseHooks.user.create.after` in `src/lib/auth.ts`; a new user is verified to receive exactly 9 categories.
- [x] Verify locally with `wrangler pages dev dist --compatibility-flag=nodejs_compat`. Verified end to end in a browser: signup → session cookie → reload → authenticated; sign out → gated view; two users see zero cross-user data; create transaction → Dashboard/Analytics update without reload; import duplicate → preview → Replace keeps row id / Skip omits.
- [ ] Push to GitHub, connect Cloudflare Pages, set production bindings, and apply `wrangler secret put` for required secrets. **Blocked on Cloudflare access** — `wrangler.jsonc` still carries the placeholder `database_id: "local-walletwise-db"`.

