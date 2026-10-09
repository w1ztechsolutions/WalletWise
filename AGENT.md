# AGENT.md — Developer & AI Operating Directives

This document sets the mandatory operational, architectural, and documentation protocols for any AI agent or developer building and maintaining **WalletWise**.

---

## 1. Core Principles & Governance

1. **Follow `PLAN.md` Rigorously:**
   - All tasks must be executed against the phases defined in [PLAN.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/PLAN.md).
   - Check off completed steps in [PLAN.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/PLAN.md) as work advances.
   - Do not deviate from the core architecture without creating an ADR.

2. **Security Compliance is Mandatory:**
   - Every file, endpoint, and query must comply strictly with [SECURITY.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/SECURITY.md).
   - Never compromise on per-user data isolation. Every database query that accesses user data must strictly filter by `created_by_id`.
   - Security reviews must follow the `ai-rules.md` DevSecOps framework: zero-trust inputs,
     fail-closed auth, parameterized queries only, user-scoped storage keys, 15-minute
     presigned URLs, bounded payloads, and sanitized errors (details in dev only).
   - Verified fixes to date (see `audit.md` v2/v3 + `docs/bugsnfix/2026-10-03-security-query-cache-and-delete-fix.md`):
     server-side `normalizeAccountNumber()` (last-4 only) on account create/update,
     `userId` in every React Query key factory, `.returning()` + 404 on all
     `DELETE` handlers when zero rows match, `category_id` ownership checks on every
     write path, `MAX_TEXT` string-length caps, LIKE-pattern escaping, layered
     `429 + Retry-After` rate limiting, receipt-attachment persistence with
     `isOwnedKey`, and Drizzle-builder rewrites of `functions/api/user/me.ts` and
     the analytics `WHERE` clauses (all runtime-probed in `audit.md` v3).

3. **Audit Documentation Must Reflect Current State:**
   - `audit.md` is a living record, not a snapshot. After any security fix, re-verify
     the finding against current `main` and update its status (`OPEN` / `RESOLVED` /
     `PARTIAL`), the severity table, and the recommended work order.
   - Never state a claim as verified unless backed by executed command output or a
     runtime probe captured during that audit pass. Distinguish
     Passed / Failed / Blocked / Not run / Not applicable.
   - Known residual gaps to track in `audit.md` until closed: DOC-02 credentialed
     Playwright counts (MEDIUM — annotate every pass count with its credential
     state and report skips), SEC-02 cross-tab cache staleness (LOW), no live R2
     signed-URL round trip yet, remote application of migration `0003` unverified
     (`wrangler d1 migrations list walletwise-db --remote`), and the FN-01/FN-02
     spec-adoption decisions (shadcn/ui, Tailwind token config). SEC-04, SEC-05,
     SEC-06, DOC-01, DOC-04, and DOC-05 were closed in the `audit.md` v3 pass.

4. **No Placeholders or Mocks in Production Code:**
   - All features, dialogs, buttons, and endpoints must be functional.
   - Never use stubbed dummy data when the database or state is connected.
   - Implement complete empty states for new users.

---

## 2. Mandatory Documentation Protocol

All documentation files (other than the root governance files `AGENT.md`, `PLAN.md`, `SECURITY.md`, `README.md`, `audit.md`, and `ai-rules.md`) **MUST** be placed in the `docs/` directory:

```text
docs/
├── adr/                       # Architectural Decision Records
│   ├── 001-cloudflare-fullstack-architecture.md
│   └── ...
├── bugsnfix/                  # Bug logs, post-mortems, and fixes
│   ├── README.md
│   └── ...
└── api/                       # API documentation and schema references
```

### Architectural Decision Records (`docs/adr/`)
Whenever a significant architectural, framework, or structural decision is made:
- Create a new file: `docs/adr/XXX-title.md` (e.g. `001-cloudflare-fullstack-architecture.md`).
- Must include:
  1. **Status:** Proposed / Accepted / Superseded
  2. **Context:** What problem or requirement triggered the decision?
  3. **Decision:** What was chosen?
  4. **Consequences:** What are the pros, cons, and trade-offs?

### Bug & Fix Tracking (`docs/bugsnfix/`)
Whenever a non-trivial bug, build failure, migration error, or security flaw is identified and fixed:
- Document it in `docs/bugsnfix/YYYY-MM-DD-short-description.md` or append to the bug tracker log.
- Must document:
  1. **Symptoms & Error Messages**
  2. **Root Cause Analysis**
  3. **Resolution / Code Changes**
  4. **Prevention Strategy**

### Audit Documentation Standards (`audit.md` — living record)
`audit.md` version history sits at the top of the file. Every audit pass must:
1. **Re-verify before repeating a claim** — re-read the cited code on current `main`;
   never copy a prior finding forward without checking it still holds.
2. **Mark status explicitly** per finding: `OPEN` / `RESOLVED` / `PARTIAL`, with the
   verifying file + line or the command output that proves it.
3. **Keep the severity table in sync** with the finding statuses after every fix.
4. **Keep the work order actionable** — resolved items move to a "Findings resolved"
   section; only open work stays in the recommended order.
5. **Record scope limits honestly** — anything derived from code reading but not
   reproduced live (two-tab cache leak, R2 round trip, production card-number probe)
   stays under "Scope limits", never under "Verified".
6. **Date every pass** — update the header date and the commit SHA under review.

---

## 3. Security Guidelines (Mandatory)

These controls are binding for every endpoint, query, and storage operation. They
operationalize [SECURITY.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/SECURITY.md)
and the `ai-rules.md` / `.clinerules` DevSecOps framework (§2.1–§2.7); where
anything conflicts, `SECURITY.md` wins. Current pass/fail status per control is
tracked in `audit.md`.

1. **Per-user data isolation (`created_by_id`)** — every D1 query touching
   user-owned data must filter on the server-derived `created_by_id`; never trust a
   client-supplied user ID. Foreign reads return `404`, never `403`
   (anti-enumeration). Required in all of `functions/api/**` and
   `workers/account-purge.ts`.
2. **No client-side secrets** — service credentials (`R2_SECRET_ACCESS_KEY`, AI
   provider token) exist only in the Workers runtime. The browser may hold only the
   HTTP-only `walletwise_session` cookie; `localStorage`/`sessionStorage` must never
   store auth state (grep-verified: none in `src/` or `functions/`).
3. **Parameterized queries only** — use Drizzle builders (`eq`/`and`/`like`/
   `inArray`) or the `sql` tag with bound values; never interpolate user input into
   SQL. The audit SEC-05 debt is cleared: `functions/api/user/me.ts` and
   `functions/api/analytics/index.ts` now use Drizzle builders, and only
   parameterized `sql` fragments remain where a builder cannot express the
   predicate (`substr(date,1,7)`, `COALESCE(SUM(...))`). LIKE filters must escape
   `\`/`%`/`_` and specify `ESCAPE '\'` (`escapeLikePattern()` in
   `functions/api/transactions/index.ts`).
4. **Server-side validation on every write** — the shared validators in
   `functions/lib/validation.ts` (`validateTransactionRow`, `validateBudgetRow`,
   `validateAttachment`, the `MAX_TEXT` caps) plus each endpoint's field checks
   are authoritative; client TypeScript types are not validation. Every
   free-text field is length-capped (`MAX_TEXT`: description/notes 500,
   names/institution 255) — enforce those caps on any new write path. Reference
   fields (`account_id`, `category_id`) require an ownership lookup and answer
   `404` for foreign ids; `attachment_key` must pass `isSafeKeyFormat()` +
   `isOwnedKey()` before it is stored.
5. **Private signed R2 storage** — object keys are `users/{userId}/…`. Every
   presign, download, and delete validates ownership with `isOwnedKey()` and format
   with `isSafeKeyFormat()` (`functions/api/storage/object.ts`,
   `functions/api/storage/download-url.ts`, `src/lib/storage.ts`); URLs are
   15-minute presigned, deletion is presigned-DELETE only, and traversal (`../`)
   is rejected before signing.
6. **Controlled error responses** — all routes return the `ApiErrorCode` envelope
   from `functions/lib/errors.ts` through `withErrorHandling`; `details` is emitted
   only when the environment is exactly `development` (fails closed in
   production). Never expose stack traces, SQL text, or infrastructure identifiers.
7. **Rate limits and payload bounds** — application rate limiting is implemented in
   `functions/lib/rate-limit.ts` and layered in `functions/_middleware.ts`
   (per-IP `edge` + `auth` buckets before session work; per-user `ai` / `import` /
   `storage` / `api` buckets after), returning `429 + Retry-After` with the
   `RATE_LIMITED` code. Counters are **per-isolate** — a Cloudflare WAF
   rate-limiting rule is still recommended for global coverage. Payload bounds
   remain path-specific (`functions/api/ai/parse-spreadsheet.ts` content-length
   check vs `MAX_BODY_BYTES`, `functions/api/import/index.ts` row cap): any new
   endpoint must bound body size, array length, and pagination, and must be
   classified in `classifyApiRequest()` (or declare its own bucket).
8. **Account-deletion lifecycle** — `deletionRequestedAt` / `deletionScheduledFor`
   (`functions/api/user/account-deletion.ts:39-41`) trigger a write freeze (403 on
   protected writes, reads still allowed) enforced in `functions/_middleware.ts`;
   restore clears both markers; the purge worker
   (`workers/account-purge.ts:16-22`) must stay parameterized, `created_by_id`-
   scoped, and gated on `deletionScheduledFor <= now`.

---

## 4. Technology & Coding Standards

1. **Frontend:**
   - React with TypeScript and Vite.
   - Tailwind CSS for all styling (use design tokens, zero arbitrary unmanaged colors).
   - Inter font from Google Fonts.
   - Icons: Use `lucide-react` exclusively.
   - Components: Follow accessible, clean `shadcn/ui` patterns.

2. **Backend & Cloudflare Edge:**
   - Cloudflare Pages Functions / Workers.
   - Drizzle ORM connecting to Cloudflare D1 (`drizzle-orm/d1`).
   - Better Auth for multi-user authentication with secure HTTP-only cookies.
   - Cloudflare R2 for private receipt and Excel file storage with presigned URLs.
   - Cloudflare Workers AI for spreadsheet parsing.

3. **Mobile-First Layout:**
   - Screen widths below tablet breakpoint: **Fixed bottom navigation bar** with 6 items, active color, and content padding.
   - Tablet & desktop: Slide-in navigation drawer with backdrop overlay.

4. **Git & Commit Hygiene:**
   - Commit logically after completing functional sub-tasks.
   - Keep `.gitignore` comprehensive: never commit `.env`, `node_modules`, `.wrangler`, or build artifacts.
