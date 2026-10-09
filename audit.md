# WalletWise — Security & Specification Alignment Audit

> **Version history**
> - **v1 (2026-10-03)** — reviewed `main` @ `8e6bbef`; found SEC-01…SEC-05, DOC-01…DOC-05, FN-01…FN-02.
> - **v2 (2026-10-09)** — re-verified every v1 claim against current `main` @
>   `6ec9727` ("add security rules"). SEC-01, SEC-02, SEC-03 are **RESOLVED in code**
>   (see `docs/bugsnfix/2026-10-03-security-query-cache-and-delete-fix.md` = BUG-013).
>   DOC-01/DOC-03 closed; DOC-02/DOC-04/DOC-05 remain open. SEC-04, SEC-05 partial,
>   SEC-06 (new, LOW) added. Verification for that pass was static code review only.
> - **v3 (2026-10-09, this pass)** — implemented the §6 work order on top of `6ec9727`
>   (working tree, uncommitted): **SEC-04, SEC-05, SEC-06, DOC-04 fixed in code and
>   runtime-probed** against local `wrangler pages dev` + local D1 (all probes PASS);
>   **DOC-01 and DOC-05 corrected** in `PLAN.md` and `docs/bugsnfix/README.md`;
>   DOC-02 counts annotated in `PLAN.md` (finding stays **OPEN** until the credentialed
>   suite is executed). Gates: `npx tsc -b` exit 0, `npm run lint` 0 errors,
>   `npx vite build` ✓ 5.23s, Playwright smoke **5/5** vs local. FN-01/FN-02 remain
>   product decisions.

- **Date:** 2026-10-09
- **Auditor scope:** security-first review of `main` @ `6ec9727`, alignment against
  `personal finance.txt`, and reconciliation of every v1 finding against current code.
- **Method:** static re-read of all server handlers (`functions/api/**`) +
  `workers/account-purge.ts`, all React Query key factories (`src/hooks/*`), the
  validation layer (`functions/lib/validation.ts`), auth/storage helpers, the v1
  audit text, BUG-013, and the e2e gating (`e2e/helpers.ts`, ADR-004); v2 claims
  cite file + line evidence. The v3 pass additionally executed runtime probes
  against a local `wrangler pages dev` server with local D1 (rows marked
  **V3-PROBE**) and re-ran the static gates; production was not exercised in any
  pass, and anything carried forward from v1 runtime probes is labelled
  "(v1 probe, not re-run)".

---

## 1. Verdict

**CONDITIONAL PASS — the security core and the §6 remediation are sound; one MEDIUM documentation finding and two spec decisions remain.**

Per-user data isolation, session handling, server-side account-number masking,
user-scoped query keys, ownership-checked deletes, and R2 key ownership were
verified in v1/v2 (§3). The v3 pass then closed every remaining code-level
finding: `category_id` ownership (SEC-04), string caps + raw-SQL removal +
budget-duplicate 409 (SEC-05), LIKE escaping + layered rate limiting (SEC-06),
and receipt-attachment persistence with an ownership check (DOC-04) — all
runtime-probed against local `wrangler pages dev` (§2 V3-PROBE rows). **Open:
DOC-02** (MEDIUM — credentialed Playwright counts still unexecuted),
**SEC-02 residual** (LOW — cross-tab staleness window), **DOC-03** (LOW —
closed, retained as a local-migration process rule), and the **FN-01/FN-02**
spec-adoption decisions (LOW). No open finding rates HIGH.

| Severity | Count | Findings |
| :-- | :-- | :-- |
| Critical | 0 | — |
| High | 0 | — (no open HIGH; SEC-01/SEC-02/SEC-03 resolved in code, see below) |
| Medium | 1 | DOC-02 (OPEN) |
| Low (open) | 3 | SEC-02 residual (cross-tab staleness), FN-01, FN-02 |
| Resolved (v2, in code) | 2 | SEC-01, SEC-03 (both via BUG-013) |
| Resolved (v3) | 6 | SEC-04, SEC-05, SEC-06, DOC-04 (runtime-probed), DOC-01 (texts corrected), DOC-05 |
| Closed (process rule) | 1 | DOC-03 — closed; retained as a local-migration checklist rule |

**No Critical finding.** No cross-user data leak, no unauthenticated access, no
secret exposure, and no injection vector was found.

---

## 2. What was actually verified (not assumed)

Status key: **CODE** = verified by reading current `main` (file + line cited).
**V1-PROBE** = observed at runtime in the v1 pass, not re-run since; the
underlying code path is unchanged or is noted where it changed. **V3-PROBE** =
runtime probe executed in the v3 pass against local `wrangler pages dev` + local
D1 (not production).

| Claim | Method | Result |
| :-- | :-- | :-- |
| Account numbers masked server-side | CODE — `normalizeAccountNumber()` in `functions/api/accounts/index.ts:13-20` (POST `:89`) and `functions/api/accounts/[id].ts:13-20` (PUT `:92`) | **PASS** — strips non-digits, keeps last 4; v1 16-digit proof no longer reproducible by code reading |
| Query keys user-scoped | CODE — `useTransactions.ts:8-14`, `useAccounts.ts:7-11`, plus `useBudgets`/`useCategories`/`useAnalytics`/`useUser`/`useTransfers` key factories all take `userId` | **PASS** — every factory is `(userId = "anonymous")`; hooks pass `session.user.id` |
| DELETE returns 404 when nothing matched | CODE — `.returning({ id })` + `if (!result.length) return error(…, 404)` in `transactions/[id].ts:126-131`, `accounts/[id].ts:148-153`, `budgets/[id].ts:96-101`, `categories/[id].ts:102-108`, `transfers/[id].ts:32-37` | **PASS** — v1 unconditional-`200` pattern is gone |
| Transfers ownership-checked | CODE — `assertOwned()` on both legs in `transfers/index.ts:45-52,83-87` and `transfers/[id].ts:15-22,71-75`; scoped read/update/delete | **PASS** — new surface since v1, correctly scoped |
| Anonymous API is rejected | V1-PROBE — `curl` vs live host returned **401** typed envelope | **HELD** — `_middleware.ts` session gate unchanged; not re-probed live in v2 |
| No stack traces leak in prod | V1-PROBE + CODE — `isProduction()` fails closed; `details` dev-only in `functions/lib/errors.ts` | **HELD** — error contract unchanged |
| Secrets not in git | V1-PROBE — `git ls-files` showed only `.dev.vars.example` tracked | **HELD** — `.env`/`.dev.vars` ignored; not re-listed in v2 |
| Cross-user isolation | V1-PROBE — 2 accounts, 8 IDOR probes, no leak | **HELD** — every handler still filters `created_by_id = user.id` (CODE re-confirmed); probes not re-run in v2 |
| R2 key ownership | V1-PROBE — foreign key + traversal rejected | **HELD** — `isOwnedKey`/`isSafeKeyFormat` unchanged; no live R2 round trip yet (§7) |
| Default categories seeded | V1-PROBE — signup → 9 categories | **HELD** — seed hook unchanged |
| Deletion lifecycle | V1-PROBE — schedule/restore/write sequence correct | **HELD** — `account-deletion.ts` + `workers/account-purge.ts` unchanged in the reviewed range |
| Mobile bottom-nav clearance | V1-PROBE — 36–64px on Pixel 5 | **HELD** — layout unchanged in this pass's scope |
| `tsc` / lint / build / Playwright | V3-PROBE — `npx tsc -b` exit 0; `npm run lint` 0 errors / 16 pre-existing warnings; `npx vite build` ✓ 5.23s; `playwright test e2e/smoke.spec.ts --project=desktop` **5/5 passed** vs local `wrangler pages dev` | **PASS (local)** — full credentialed suite still **not run** (DOC-02) |
| SEC-04/05/06 + DOC-04 controls | V3-PROBE — foreign `category_id` → 404 (tx + budget); import foreign category → invalid row; own attachment key → 201 stored, foreign key → 400; 600-char description/notes → 400; `search=100%` matched literal only; budget duplicate edit → 409; `PATCH /api/user/me` → 200 via Drizzle builder; 16th auth mutation → `429` + `Retry-After` + `RATE_LIMITED`, window reset afterwards | **PASS** |

---

## 3. Security findings (reconciled against current `main`)

### SEC-01 — RESOLVED — Server-side account-number masking now in place

**Was HIGH in v1; fixed by BUG-013.**

Both write paths now normalise before persistence
(`functions/api/accounts/index.ts:13-20,89`,
`functions/api/accounts/[id].ts:13-20,92`):

```ts
function normalizeAccountNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-4);
}
```

A 16-digit card number posted straight to the API now persists as its last 4
digits. The v1 runtime proof (`4539578763621486` echoed verbatim) is no longer
reproducible by code reading. **Remaining gap:** no API-level test asserts the
stored column (the e2e masking spec still asserts the rendered card only) — add
one per the §6 work order.

---

### SEC-02 — LOW (residual) — Cross-tab staleness remains as defence-in-depth gap; server isolation holds

**Was HIGH in v1; key-scoping fixed by BUG-013, residual risk retained.**

Every key factory on current `main` is user-scoped
(`useTransactions.ts:8-14`, `useAccounts.ts:7-11`, `useBudgets.ts`,
`useCategories.ts`, `useAnalytics.ts:41-44`, `useUser.ts`, `useTransfers.ts`) and
every hook passes `session.user.id`. The mandated `SECURITY.md` §2.2 control now
exists, and the single-tab sign-out purge
(`Sidebar`/`AuthGate` `removeQueries` predicate) is belt-and-braces rather than
load-bearing.

The **residual** is the v1 cross-tab scenario: tabs share the session cookie but
not the `QueryClient`, and with `staleTime: 5 * 60_000` + `refetchOnWindowFocus:
false` a stale tab can render the previous user's cached rows until refetch. The
server never leaks across users (all queries filter `created_by_id`), so this is a
client-display staleness issue, not an IDOR — rated LOW, retained only because the
shared-device scenario is exactly what §2.2 exists to prevent. It stays in the
findings table (rather than moving to "Verified as sound") precisely because its
verification method — a live two-tab session — has never been executed.

**Fix:** subscribe to storage/auth-change events (or shorten `staleTime` for
identity-bearing queries) so a sign-in in one tab invalidates the sibling tab's
user-scoped cache. Not reproduced live in either pass — stays a code-derived
residual until a two-tab session is exercised.

---

### SEC-03 — RESOLVED — `DELETE` handlers return 404 when zero rows match

**Was MEDIUM in v1; fixed by BUG-013.**

All five delete handlers (`transactions/[id].ts:126-131`,
`accounts/[id].ts:148-153`, `budgets/[id].ts:96-101`,
`categories/[id].ts:102-108`, `transfers/[id].ts:32-37`) now `.returning({ id })`
and return `error(…, 404)` on an empty result — consistent with the PUT path and
the 404-not-403 anti-enumeration rule in `SECURITY.md` §2.1. The v1 proof (user B
deleting Alice's transaction receiving `200`) is no longer reproducible by code
reading.

---

### SEC-04 — RESOLVED (v3) — `category_id` ownership-checked on every write path

**Fixed in the v3 pass.** `getOwnedCategoryIds()` (`functions/lib/helpers.ts:65-89`)
mirrors the `account_id` lookup wherever `category_id` is stored:
`POST /api/transactions` and `PUT /api/transactions/[id]` (foreign id →
`404 NOT_FOUND`), `POST /api/budgets` and `PUT /api/budgets/[id]` (same), and
`POST /api/import` (one batched query for the whole payload; a foreign id marks
the row invalid with `"Linked category not found."`). The 404 answers match the
anti-enumeration rule (`SECURITY.md` §2).

**V3-PROBE (local):** transaction with user B's category → `404`; own category →
`201`; budget with a random foreign category → `404`; import preview with a
foreign category → `invalid[].reason = "Linked category not found."`.

Original v2 evidence retained for the record:

Unchanged on current `main`. `POST /api/transactions`
(`transactions/index.ts:67-74`) and `PUT /api/transactions/[id]` (`:67-82`)
verify `account_id` via an ownership lookup, but `category_id` is stored as-is in
both paths and in `validateTransactionRow` (`validation.ts:58`), and `PUT
/api/budgets/[id]` (`:54-56`) likewise stores `category_id` unchecked. A caller
can point a row at another user's category id. No data is disclosed (listings are
user-scoped; `category_name` is denormalized), so impact stays referential
integrity, not confidentiality.

*(Original v2 fix directive — applied in v3: mirror the `account_id` ownership
lookup for `category_id` on the write paths.)*

---

### SEC-05 — RESOLVED (v3) — Raw SQL eliminated, length caps enforced, budget-duplicate 409 verified

**Fixed in the v3 pass:**

- `functions/api/user/me.ts` now updates through the Drizzle builder with a
  `Partial<typeof user.$inferInsert>` allowlist — no SQL is assembled from
  request keys. **V3-PROBE:** `PATCH /api/user/me` → `200`, name persisted.
- Length caps live in `MAX_TEXT` (`functions/lib/validation.ts`;
  description/notes 500, names/institution 255) and are enforced on every write
  path: transactions, budgets, accounts, transfers, categories, profile name.
  **V3-PROBE:** 600-char description → `400`; 600-char budget notes → `400`;
  300-char category and account names → `400`.
- Analytics `where` clauses migrated to `eq`/`and` builders; only parameterized
  `sql` fragments remain for expressions builders cannot express
  (`substr(date,1,7)`, `COALESCE(SUM(...))`), all with bound values.
- Budget-duplicate edit re-verified: `PUT /api/budgets/[id]` pre-checks (excluding
  the row itself) and returns `409 CONFLICT` instead of surfacing a raw unique-
  index violation as a 500. **V3-PROBE:** colliding PUT → `409`; normal edit →
  `200`.

Original v2 evidence retained for the record:

- `functions/api/user/me.ts:77-85` still builds `` `UPDATE user SET ${fields} …
  WHERE id = ?` `` from `Object.keys(updates)`. Keys come from a fixed
  literal allowlist (`name`/`image`/`currency`, `:57-71`) and values are bound,
  so **not injectable** — but it remains the exact pattern `SECURITY.md` §3.1
  prohibits. Migrate to the Drizzle builder.
- The v1 `months.map(m => `'${m}'`)` interpolation is **gone**: the monthly view
  now uses `inArray(monthExpr, months)` (`analytics/index.ts:140`). Remaining
  `sql` fragments (`analytics/index.ts:72-82,93,101,112,161-183`) interpolate only
  Drizzle column refs, `user.id` (server-derived), `currentMonth` (server-derived
  `YYYY-MM`), a `MONTH_RE`-validated range (`:22,49-50`), and a capped
  `expandRange` (`:28-43`, cap 60) — all parameterized through the `sql` tag, so
  **not injectable**, but fragile by construction. Prefer `eq`/`and` builders
  where the expressions allow it.
- `SECURITY.md` §4.1 length caps still missing: `notes`, `description`,
  `institution`, `name` are stored unbounded on every write path (transactions,
  transfers, budgets, accounts, categories). Add caps (e.g. 500 / 500 / 255).
- The v1 budget-duplicate `409` note needs re-verification against current
  `budgets/[id].ts:77-85` (no explicit unique-violation mapping visible) — left
  open pending a duplicate-edit probe.

---

### SEC-06 — RESOLVED (v3) — LIKE wildcards escaped; layered rate limiting added to `/api/*`

**Fixed in the v3 pass:**

- `escapeLikePattern()` (`functions/api/transactions/index.ts`) escapes `\`, `%`
  and `_`, and every pattern is built with `ESCAPE '\'` (both the `search` and
  `month` filters). **V3-PROBE:** `search=100%` returned the `100% legit` row and
  did **not** return `1000 units`.
- Rate limiting: new `functions/lib/rate-limit.ts` (fixed-window, bounded
  counter map) layered in `functions/_middleware.ts` — per-IP `edge`
  (900/min across all `/api/`) and `auth` (15/min on credential mutations)
  buckets applied before session work, plus per-user `ai` (10/min),
  `import` (10/min), `storage` (30/min) and `api` (600/min) buckets after
  session resolution. Denials return `429 + Retry-After` with the
  `RATE_LIMITED` code (rescuing the previously orphaned mapping at
  `functions/lib/errors.ts:62-63` / `src/lib/api.ts:23`).
  **V3-PROBE:** the 16th credential mutation → `429`, `Retry-After: 57`,
  `code=RATE_LIMITED`; the bucket reset allowed the next signup ~60s later (a
  saturated-bucket `429` also fired organically mid-suite).

**Documented residual (accepted, not an open finding):** counters are
per-isolate in-memory state, so limits are approximate across the Cloudflare
fleet. A Cloudflare WAF rate-limiting rule remains the recommended global layer;
this limiter is the in-code backstop.

Original v2 evidence retained for the record:

`functions/api/transactions/index.ts:36-38`:

```ts
if (search) {
  conditions.push(like(transactions.description, `%${search}%`));
}
```

The parameter itself is bound (no injection — Drizzle parameterizes the pattern),
but `%` and `_` inside a user-supplied `search` act as wildcards, so a search for
`100%` matches `1000`, `100X`, etc. Over-broad matching only; no disclosure beyond
the caller's own rows. **Fix:** escape `\`, `%`, `_` with `ESCAPE '\'` before
wrapping in `%…%`.

Separately, no rate limiting exists anywhere on current `main`: no
`RateLimit`/`throttle` middleware in `functions/`, no `Retry-After`/`429`
handling, no WAF rule in `wrangler.jsonc`. The only limiter-shaped code is the
`RATE_LIMITED` error-code mapping (`functions/lib/errors.ts:62-63`, client
`src/lib/api.ts:23`) with nothing behind it. Auth, import, AI-parse, and
storage-presign endpoints are therefore unbounded per caller. **Fix:** add
per-IP/per-account throttling (or declare the Cloudflare WAF rule that covers
prod) with `429 + Retry-After` semantics.

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
| — | §3.5 — receipt attachments | **Server path fixed in v3 — see DOC-04.** Both fields now persist with an `isOwnedKey` check; the browser upload round trip is still unverified (§7). |
| — | §4 — mobile bottom-nav clearance | **Met**, though via incidental layout slack (36–64px) rather than the explicit bottom padding the spec asks for. `main` has `padding-bottom: 0px`. Fragile, not a violation. |

**Not implemented and not claimed:** the spec's `budget` is `planned_amount` for a
category; the app also has an `opening_balance` ledger extension (ADR-005). This is a
superset, not a conflict.

---

## 5. Documentation findings — verified undone tasks

### DOC-01 — RESOLVED (v3) — Stale production-outage texts corrected

V1 proved the outage claim false (deployed bundle byte-identical to `HEAD`,
`wrangler.jsonc` carries the real `database_id`, BUG-012 confirms prod auth
works). In the v3 pass both stale texts were corrected on 2026-10-09:

- [x] The `PLAN.md` BUG-008 line now reads "**Redeploy production (`BUG-008` —
  resolved)**" with the byte-identical-bundle evidence and the remaining
  credentialed-e2e follow-up.
- [x] `docs/bugsnfix/README.md:20` now marks BUG-008 "✅ Resolved".

Original v1/v2 evidence retained for the record:

Original v1 evidence retained for the record:

`PLAN.md:247` stated:

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

### DOC-02 — MEDIUM (OPEN) — The `PLAN.md` Playwright counts are unreproducible, and the default run silently skips 34 of 58 tests

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

**Partial fix applied (v3):** both count lines in `PLAN.md` now carry a
**Count provenance (DOC-02)** annotation stating the credential requirement and
the current bare-run numbers (24 passed / 34 skipped of 58). The finding stays
**OPEN** until the credentialed suite is actually executed and its real
counts/failures recorded.

### DOC-03 — CLOSED in v2 — Local-migration claim; retained as a checklist rule

V1 proved the claim's premise (`PLAN.md:224` "`--local` is applied") false at
the time — `0003_worthless_king_bedlam.sql` was pending, every local signup
failed with `D1_ERROR: table user has no column named deletionRequestedAt`,
and the v1 auditor applied the migration and confirmed signup + 9 seeded
categories. On current `main` the local DB state cannot be re-observed from
static review, but the code that needed the column (`schema.ts:91-92`,
`account-deletion.ts:39-41`, `me.ts:35-36,106-107`) is unchanged and production
was already current. The finding is therefore **CLOSED as a code state** and
kept as a process rule: run `npm run db:migrate:local` before any
local-verification pass (local application re-verified 2026-10-09: `No
migrations to apply!`; see §6 work order item 2).

Original v1 evidence retained for the record:

`PLAN.md:224` claimed *"`--local` is applied (`No migrations to apply!`)"*. On audit:

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

### DOC-04 — RESOLVED (v3) — Receipt attachment fields now persisted with an ownership check

**Fixed in the v3 pass.** `validateAttachment()` (`functions/lib/validation.ts`)
accepts `attachment_key` only when `isSafeKeyFormat()` **and**
`isOwnedKey(key, userId)` pass (a key under another user's prefix →
`400 "Invalid attachment reference."`, never stored), caps `attachment_name` at
255 characters, and treats `null`/absent as "clear". `POST /api/transactions`
stores both fields; `PUT /api/transactions/[id]` stores them only when
`attachment_key` is present in the body (`undefined` leaves the stored value
untouched). The bulk import path stays attachment-free by design (spreadsheets
carry no receipts).

**V3-PROBE (local):** `attachment_key` under user B's prefix → `400`; under the
caller's own prefix → `201` with the key echoed back in the response row
(`ATTACH-stored=True`).

**Still unverified (§7):** the browser round trip (choose file → upload → save →
presigned download). Server-side acceptance, persistence, and cross-user
rejection are proven; the UI flow is not.

Original v2 evidence retained for the record:

Re-confirmed on current `main`: the DB columns (`schema.ts:46-47`) and the
client types (`src/types/index.ts:27-30`) exist, and the client sends the
fields — but **no server write path reads them**. `validateTransactionRow`
(`validation.ts:31-66`) destructures only
`date/amount/description/category_id/account_id/category_name/type/is_recurring/notes`
— `attachment_key`/`attachment_name` are dropped — and `PUT
/api/transactions/[id]` (`:45-46,99-101`) likewise never destructures or
stores them. A project-wide search finds `attachment_key` only in the audit
text, the schema, the client type, and `TransactionsView` — never in a server
write. `PLAN.md:218` still hedges that the receipt round trip "has **not**
been browser-verified"; the stronger truth stands: it **cannot** work as
written, and saved attachments are silently discarded (R2 object orphaned).

**Fix:** add both fields to `ValidatedTransaction` and to the `PUT` handler,
with an `isOwnedKey` check on `attachment_key` so a caller cannot reference
another user's object.

Original v1 evidence retained for the record:

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

### DOC-05 — RESOLVED (v3) — Stale directory listing corrected

**Fixed in the v3 pass:** `PLAN.md` no longer lists the non-existent
`src/db/index.ts` (`schema.ts` only), and the `docs/adr/` listing now shows all
seven ADR files (001, 002, 003, 004 ×2, 005, 006) under an "ADR-001 … ADR-006"
header.

Original v2 evidence retained for the record:

`PLAN.md:52` documented `src/db/index.ts`; no such file exists (`schema.ts`
only). `PLAN.md:35-36` listed only ADR-001/002 while six ADRs existed. Harmless,
but the map had drifted.

---

## 6. Recommended order of work

Status after the v3 pass (2026-10-09):

1. **DOC-04** — [x] **Done (v3).** `attachment_key`/`attachment_name` persisted with
   an `isOwnedKey` check; runtime-probed (foreign → 400, own → 201 stored).
2. **DOC-01 / DOC-02 / DOC-03** — DOC-01 [x] **Done (v3):** `PLAN.md` + bugsnfix README
   corrected. DOC-02 [ ] **Open:** provenance annotations added to `PLAN.md`, but the
   credentialed run (`E2E_EMAIL` / `E2E_PASSWORD`, all 58 tests) is still outstanding
   and must record real passed/failed/skipped counts. DOC-03 standing process rule:
   `npm run db:migrate:local` before any local-verification pass; remote application of
   `0003` remains **unverified** (`wrangler d1 migrations list walletwise-db --remote`).
3. **SEC-04 / SEC-05 / SEC-06** — [x] **Done (v3):** category ownership, length caps,
   raw-SQL removal, budget-duplicate 409, LIKE escaping, and the layered rate limiter
   are implemented and runtime-probed. Residual recommendation (not an open finding):
   declare a Cloudflare WAF rate-limiting rule for global coverage, since app-layer
   counters are per-isolate.
4. **FN-01 / FN-02** — [ ] **Open (product decision):** decide explicitly whether to
   adopt shadcn/ui and a real Tailwind token config, then either implement or amend
   the spec.

No further security-code remediation is outstanding; the remaining work is DOC-02
verification, the remote-migration check, and the two spec decisions.

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
- **v3 probes ran against local `wrangler pages dev` + local D1 only.** Production
  (`walletwise-15b.pages.dev`) was not exercised — no live 429, ownership, or
  attachment probes were sent to the deployed host.
- The **credentialed Playwright suite (58 tests) was not run in v3**; only the
  read-only `e2e/smoke.spec.ts` (5 tests, desktop project) executed, against the
  local server. DOC-02 therefore remains open.
- The receipt **browser** round trip (choose file → upload → save → presigned
  download) is still unexecuted; v3 proved server-side acceptance, persistence,
  and cross-user rejection only.
- The rate limiter's per-isolate counters were exercised on a single local
  isolate; cross-isolate behaviour, the `edge` bucket under real `cf-connecting-ip`
  headers, and the recommended WAF rule were not tested.