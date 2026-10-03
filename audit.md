# WalletWise — Security & Specification Alignment Audit

- **Date:** 2026-10-03
- **Auditor scope:** security-first review of `main` @ `8e6bbef`, alignment against
  `personal finance.txt`, and verification of every task the documentation still
  marks as undone.
- **Method:** static review of all 20 server handlers + `workers/account-purge.ts`,
  runtime probes against `wrangler pages dev`, cross-user IDOR probes with two real
  accounts, a live production probe, and a full Playwright run. Every "verified"
  claim below is backed by command output captured during this audit.

---

## 1. Verdict

**CONDITIONAL PASS — the security core is genuinely sound; documentation is not.**

Per-user data isolation, session handling, error sanitization, and R2 key ownership
are implemented correctly and survived adversarial probing (§3). However, this
repository carries **three confirmed defects** (one privacy, one broken feature,
one broken local environment) and, more seriously, **a pattern of documentation
that asserts verified facts which are false or unreproducible** (§5). The
documentation cannot currently be trusted as a statement of system state.

| Severity | Count | Findings |
| :-- | :-- | :-- |
| Critical | 0 | — |
| High | 2 | SEC-01, SEC-02 |
| Medium | 4 | SEC-03, SEC-04, DOC-01, DOC-02 |
| Low | 5 | SEC-05, DOC-03, DOC-04, FN-01, FN-02 |

**No Critical finding.** No cross-user data leak, no unauthenticated access, no
secret exposure, and no injection vector was found.

---

## 2. What was actually verified (not assumed)

| Claim | Method | Result |
| :-- | :-- | :-- |
| `npm run build` passes | `npm run build` | **PASS** — `tsc -b && vite build`, built in 5.51s |
| Lint clean | `npm run lint` (oxlint) | **0 errors**, 20 warnings (unused imports) |
| Production is current | SHA-256 of deployed vs. local `dist` bundle | **BYTE-IDENTICAL** — `E6EC5B86…6486` both |
| Anonymous API is rejected | `curl` vs `walletwise-15b.pages.dev` | **401** `{"error":"Unauthorized","code":"UNAUTHORIZED"}` |
| No stack traces leak in prod | `curl` unknown `/api/*` route | Sanitized envelope, no internals |
| Secrets not in git | `git ls-files` | Only `.dev.vars.example` tracked; `.env`/`.dev.vars` ignored |
| Production D1 migrated | `wrangler d1 migrations list --remote` | **"No migrations to apply!"** |
| Cross-user isolation | 2 accounts, 8 IDOR probes | **No leak** — all reads/writes/deletes blocked |
| R2 key ownership | Foreign key + traversal probes | **404** / rejected — correct |
| Default categories seeded | Signup → `GET /api/categories` | **9 categories** — matches spec |
| Deletion lifecycle | schedule ×2, write, read, restore, write | 200 / 409 / 403 / 200 / 200 / 201 — correct |
| Mobile bottom-nav clearance | Pixel 5, scrolled to bottom, 6 views | **36–64px clearance** — criterion **met** |

---

## 3. Security findings

### SEC-01 — HIGH — Account numbers are masked only in the browser; the API stores full card numbers

**Spec violated:** `personal finance.txt` §3.7, §3.2. **`SECURITY.md` §4.1 violated.**

`AccountsView.tsx:97-102` masks the value client-side before sending it. The server
performs no masking and no length cap:

```ts
// functions/api/accounts/index.ts — POST
account_number: typeof account_number === "string" ? account_number : "",
// functions/api/accounts/[id].ts — PUT
updates.account_number = account_number;   // any length, any content
```

**Runtime proof** — a full 16-digit card number posted straight to the API was
accepted and echoed back verbatim:

```
POST /api/accounts  {"account_number":"4539578763621486", …}
-> {"account_number":"4539578763621486", …}          # stored, unmasked
```

Client-side masking is a UX affordance, not a security control. Any API client —
curl, a mobile build, a future integration — bypasses it entirely, which is exactly
what `SECURITY.md` §4.1 forbids. The existing e2e spec
(`app.spec.ts:143`, *"masking the account number"*) only asserts the **rendered
card**, never the persisted value, so the suite gives false confidence here.

**Fix:** mask and cap server-side in both handlers — reject or reduce anything
longer than 4 characters to its last four digits, and cap length. Add an API-level
test that asserts the stored column, not the DOM.

---

### SEC-02 — HIGH — React Query cache keys do not include the user identity

**Spec violated:** `personal finance.txt` §3.2. **`SECURITY.md` §2.2 violated.**

`SECURITY.md` §2.2 is unambiguous: *"TanStack React Query cache keys must explicitly
include the authenticated user ID."* Every key factory omits it:

| Hook | Actual key |
| :-- | :-- |
| `useTransactions` | `["transactions","list",{…filters}]` |
| `useAccounts` | `["accounts","list"]` |
| `useBudgets` | `["budgets","list",…]` |
| `useCategories` | `["categories","list"]` |
| `useAnalytics` | `["analytics",…]` |
| `useUser` | `["user"]` |

The mandated control simply does not exist. What protects users today is a
*different* mechanism — `Sidebar.handleSignOut` and `AuthGate`'s 401 handler both
call `removeQueries({ predicate: q => q.queryKey[0] !== 'session' })`
(`Sidebar.tsx:61-63`, `AuthGate.tsx:29-31`). That purge is per-`QueryClient`, and the
client is in-memory only, so it does hold for the single-tab sign-out path.

It does **not** hold across browser tabs, which share a session cookie but not a
`QueryClient`. With `staleTime: 5 * 60_000` and `refetchOnWindowFocus: false`
(`main.tsx:54-55`, `useSession.ts:49`), a tab signed in as user A keeps rendering
A's transactions and A's identity for up to 5 minutes after B authenticates in
another tab. That is the shared-device scenario this control exists to prevent.

**Fix:** thread `session.user.id` into every key factory
(`["transactions", userId, "list", filters]`). This also makes the logout purge
belt-and-braces rather than load-bearing.

---

### SEC-03 — MEDIUM — `DELETE` handlers return `200 {success:true}` when nothing was deleted

`transactions/[id].ts:126-130`, `accounts/[id].ts:139-142`, `budgets/[id].ts:93-97`
and `categories/[id].ts:102-105` all run a scoped `DELETE` and then return success
unconditionally, never inspecting the affected-row count.

**Runtime proof:** user B issued `DELETE /api/transactions/<alice's id>` and
received **200** — Alice's row was correctly left untouched, but the response
claimed success. `PUT` on the same path correctly returns 404, so the two verbs are
inconsistent.

Not a data leak — the scoping is right — but a client cannot distinguish "deleted"
from "not yours / already gone", which defeats the 404-not-403 anti-enumeration goal
in `SECURITY.md` §2.1 for the delete path.

**Fix:** use `.returning()` and return `404` when zero rows were affected.

---

### SEC-04 — MEDIUM — `category_id` is accepted without an ownership check

`POST /api/transactions` and `PUT /api/transactions/[id]` validate that `account_id`
belongs to the caller (`transactions/index.ts:67-74`) but apply **no** equivalent
check to `category_id`. A caller can point a transaction at another user's category
id. Because `category_name` is denormalized onto the row and category listings are
user-scoped, no data is disclosed — the impact is referential integrity, not
confidentiality. It is nonetheless an asymmetry: the codebase enforces ownership on
one foreign key and not the other.

**Fix:** mirror the `account_id` ownership lookup for `category_id`, or drop the FK.

---

### SEC-05 — LOW — Raw SQL string interpolation, and unbounded string fields

- `functions/api/user/me.ts:78-83` builds `` `UPDATE user SET ${fields} WHERE id = ?` ``
  from `Object.keys(updates)`. The keys come from a fixed literal allowlist
  (`name`/`image`/`currency`) and values are bound, so this is **not currently
  injectable** — but it is the exact pattern `SECURITY.md` §3.1 prohibits, one
  careless edit away from a real hole. Use Drizzle.
- `functions/api/analytics/index.ts:101` interpolates
  `` months.map(m => `'${m}'`).join(', ') `` into a `sql` template. The values are
  `Date`-derived `YYYY-MM` strings, so again **not injectable**, but it bypasses
  parameterization for no reason. Use `inArray`.
- `SECURITY.md` §4.1 requires strings to be "trimmed and length-capped". No handler
  caps `notes`, `description`, `name`, or `institution` length.
- The budget-duplicate path (`budgets/[id].ts`) never maps the
  `budget_user_month_category_idx` violation to `409` the way `import` does, so a
  duplicate edit surfaces as a generic 500 rather than the documented `CONFLICT`.

---

### Verified as sound (no action)

- **No IDOR.** All 8 cross-user probes blocked; foreign reads returned 404, never 403,
  matching the anti-enumeration rule.
- **Auth/session.** HTTP-only `walletwise_session` cookie, no `localStorage` or
  `sessionStorage` anywhere in `src/` or `functions/` (grep-verified). `AuthGate`
  and `Sidebar` correctly handle Better Auth's `{data, error}` resolution shape.
- **R2.** `isOwnedKey` prefix-scopes to `users/{userId}/`; traversal (`../..`)
  rejected by `isSafeKeyFormat`; 15-minute TTL; presigned DELETE.
- **Error contract.** `isProduction()` fails closed — only the exact string
  `"development"` reveals `details`; the production response is a clean envelope.
- **Purge worker.** Correctly parameterized, scoped by `created_by_id`, and guarded by
  `deletionScheduledFor <= now`.
- **Deletion freeze.** Writes blocked with 403, reads still allowed, restore clears
  the markers — verified end to end.

---

## 4. Specification alignment (`personal finance.txt`)

### Confirmed aligned

Data entities (incl. `created_by_id` on every table) · dashboard stat cards, donut,
6-month trend, budget-vs-actual, recent transactions · transactions search/filter/
grouping/dialogs · accounts net-worth header, type tabs, institution presets, color
picker · budgets month navigator with duplicate prevention · analytics all-time stats,
trend, "Other" bucket, top categories · settings category manager, Excel import with
preview/review, CSV templates, CSV/JSON report export · Inter 300–700 · lucide-react
only · React Query for all reads with post-mutation invalidation · shared
`formatCurrency` helper · six-section nav · slide-in sidebar with overlay · 9 seeded
default categories · empty states · no cross-user data.

### Gaps

| # | Spec item | Status |
| :-- | :-- | :-- |
| FN-01 | §5 — shadcn/ui components (Button, Dialog, Input, Select, Label, Tabs, Progress) | **Not met.** `src/components/ui/` contains only `ErrorBoundary.tsx` and `Toast.tsx`; no `@radix-ui` or shadcn dependency. All controls are hand-rolled. |
| FN-02 | §5 — "semantic Tailwind tokens … mapped through the Tailwind config — no hardcoded hex values in components" | **Partially met.** No `tailwind.config.*` exists (Tailwind v4 `@theme` in `index.css`); tokens are consumed largely as inline `style={{ backgroundColor: 'var(--…)' }}`; 37 hardcoded hex literals remain across 8 component files (`DashboardView` 11, `AnalyticsView` 11, `SettingsView` 10, `Toast` 4, others 1 each). |
| — | §3.1 — "email/password **and social login**"; `SECURITY.md` §1.1 "OAuth social providers" | **Not met.** `src/lib/auth.ts` enables `emailAndPassword` only; no `socialProviders` anywhere. |
| — | §3.3 — "Row-Level Security … at the database level" | **Not applicable as written.** D1/SQLite has no RLS. The platform-appropriate equivalent — mandatory `created_by_id` scoping on every query — **is** implemented and verified. The spec text should be amended rather than the code changed. `SECURITY.md` §3.2 is already worded correctly. |
| — | §3.10 — email hygiene | **Out of scope.** The app sends no email. Nothing to implement. |
| — | §3.5 — receipt attachments | **Broken end to end — see DOC-04.** |
| — | §4 — mobile bottom-nav clearance | **Met**, though via incidental layout slack (36–64px) rather than the explicit bottom padding the spec asks for. `main` has `padding-bottom: 0px`. Fragile, not a violation. |

**Not implemented and not claimed:** the spec's `budget` is `planned_amount` for a
category; the app also has an `opening_balance` ledger extension (ADR-005). This is a
superset, not a conflict.

---

## 5. Documentation findings — verified undone tasks

### DOC-01 — MEDIUM — `PLAN.md` and the bug index both report a stale, already-fixed production outage

`PLAN.md:247` states:

> **[ ] Redeploy production (BUG-008 — still open).** The live deployment is three
> commits stale and its D1 `database_id` is still the `local-walletwise-db`
> placeholder, so sign-up and sign-in return `500` for every visitor.

`docs/bugsnfix/README.md:20` likewise marks BUG-008 **"🔴 Open — fix committed,
redeploy required"**.

**This is false.** The deployed bundle is byte-identical to a fresh build of `HEAD`:

```
deployed  /assets/index-9tUn7KOe.js  sha256=E6EC5B86CADE94F5C5F3BC67E0FE082C09881D82B7FBFDD38BF7F0168EA36486
local     dist/assets/index-9tUn7KOe.js  sha256=E6EC5B86CADE94F5C5F3BC67E0FE082C09881D82B7FBFDD38BF7F0168EA36486
IDENTICAL = True
```

`wrangler.jsonc` carries the real `database_id` (`e9d133d0-…`), and the live site
returns `200` with the correct typed `401` envelope. BUG-012 independently confirms
sign-up and sign-in work in production. **Close BUG-008 and clear the `PLAN.md`
checkbox.**

### DOC-02 — MEDIUM — The `PLAN.md` Playwright counts are unreproducible, and the default run silently skips 34 of 58 tests

`PLAN.md:246` claims **"52/52 Playwright specs passing across `desktop` and
`mobile`"** and `PLAN.md:255` claims **"56/56 Playwright tests passed"**. The suite
now contains **58** tests, and a bare `npm run test:e2e` produces:

```
Running 58 tests using 1 worker
  34 skipped
  24 passed (2.3m)
```

Every authenticated spec — all of `app.spec.ts` (13×2), the signed-in navigation
specs (5×2), and the sign-in round trip (1×2) — is gated behind
`requireCredentials()` and silently skips. Two of the three headline counts are
therefore not reproducible by the documented command, and a green-looking run
proves far less than it appears to.

Running the suite **with** credentials surfaced real failures: the account-deletion
spec returned **500** in the full run (it passed in isolation), and the account
masking and import specs also failed. So "56/56 passing" is not currently
substantiated in either mode. The account-deletion spec mutates the shared
account's global deletion state, which makes it order- and state-dependent; I could
not establish its root cause within this audit's scope and am flagging it as flaky
rather than diagnosing it.

**Fix:** state the credential requirement next to every pass count, report
passed/failed/skipped separately, and never quote a bare total.

### DOC-03 — LOW — `PLAN.md` claims local migrations are applied; they were not, and local sign-up was broken

`PLAN.md:224` claims *"`--local` is applied (`No migrations to apply!`)"*. On audit:

```
$ npx wrangler d1 migrations list walletwise-db --local
Migrations to be applied:  0003_worthless_king_bedlam.sql
```

Consequence: **every local signup failed** with
`D1_ERROR: table user has no column named deletionRequestedAt`, surfacing as
`422 {"code":"FAILED_TO_CREATE_USER"}` — so no authenticated local verification had
been possible since the account-deletion feature landed. I applied it
(`3 commands executed successfully`) and confirmed signup then works and seeds 9
categories. Production was unaffected (remote is current). Add
`npm run db:migrate:local` to any local-verification checklist.

### DOC-04 — LOW (High user impact) — The receipt-attachment feature is silently non-functional

`TransactionsView.tsx:245-246` sends `attachment_key` and `attachment_name`, but
neither server path accepts them: `validateTransactionRow` does not read them and
`PUT /api/transactions/[id]` does not destructure them. **Runtime proof:**

```
persisted fields: ["date","amount","description","category_id","account_id",
                   "category_name","type","is_recurring","notes"]
attachment_key present in validated row:   false
attachment_name present in validated row:  false
```

A user attaches a receipt, sees "Receipt attached", saves successfully — and the
reference is discarded. After reload the attachment is gone and the R2 object is
orphaned (storage cost, unreachable). The DB columns and migration exist, so this
looks complete in review while doing nothing. `PLAN.md:217` hedges that the receipt
round trip "has not been browser-verified"; the stronger truth is that it cannot
work as written.

**Fix:** add both fields to `ValidatedTransaction` and to the `PUT` handler, with
an `isOwnedKey` check on `attachment_key` so a caller cannot reference another
user's object.

### DOC-05 — LOW — Stale directory listing

`PLAN.md:52` documents `src/db/index.ts`; no such file exists (`schema.ts` only).
`PLAN.md:35-36` lists only ADR-001/002; six ADRs now exist. Harmless, but the map
has drifted.

---

## 6. Recommended order of work

1. **SEC-01** — mask/cap `account_number` server-side; assert the stored column in a test.
2. **SEC-02** — add `userId` to every React Query key factory.
3. **DOC-04** — persist `attachment_key`/`attachment_name` with an ownership check.
4. **SEC-03** — return 404 from `DELETE` when zero rows matched.
5. **DOC-01 / DOC-02 / DOC-03** — correct the three false verification claims; gate every
   pass count on credentials and report skips.
6. **SEC-04 / SEC-05** — `category_id` ownership; remove raw SQL interpolation; cap string lengths.
7. **FN-01 / FN-02** — decide explicitly whether to adopt shadcn/ui and a real Tailwind
   token config, then either implement or amend the spec.

---

## 7. Scope limits — what this audit did **not** establish

Stated plainly so these are not mistaken for verified:

- The **500** in the account-deletion spec was observed once in a full-suite run and
  did not reproduce in isolation or against a fresh account. Root cause **unknown**.
- `SEC-02`'s cross-tab leak is derived from code reading plus the `staleTime` /
  `refetchOnWindowFocus` configuration; it was **not** reproduced in a live two-tab
  browser session.
- `SEC-01` was proven against local D1 only; production behaviour was not exercised
  with a real card number.
- No live R2 upload round trip was performed (requires production R2 secrets), so
  `isOwnedKey` was validated by probe rather than by an actual signed upload.
- Bundle size is 1.14 MB (345 kB gzip) in a single un-split chunk. Not a security
  issue and not required by the spec, but it works against the mobile-first
  requirement.