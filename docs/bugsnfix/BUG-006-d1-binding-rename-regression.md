# BUG-006: Pushed `wrangler.jsonc` Renamed the D1 Binding — Every Endpoint Would Crash at Runtime

- **Date:** 2026-10-02
- **Severity:** Critical (entire backend non-functional on any real deployment; silent in local builds)
- **Component:** `wrangler.jsonc`
- **Status:** Resolved

---

## 1. Symptoms & Error Message

None at build time. `npm run build` (tsc + vite) passed and the
working tree was clean, because TypeScript checks the **static**
`Env` interface, not the deployed binding names. The defect only
surfaces at runtime on Cloudflare (or in `wrangler pages dev`
against a real D1):

- Every `/api/*` route would throw on first touch of the database:
  `createAuth(context.env.DB)` and `drizzle(env.DB)` receive
  `undefined`, because the binding is now named `walletwise_db`.
- `functions/_middleware.ts` session verification fails, so even
  `GET /api/transactions` cannot return its usual `401` — it would
  return Cloudflare's opaque HTML 500 page.

Commit `5da2c63` ("fix(cors): update R2 rules and enable DELETE
requests") renamed the D1 binding `DB` → `walletwise_db` and added
a second, duplicate R2 binding (`walletwise_storage`, same bucket,
`"remote": true`) that no code references.

## 2. Root Cause Analysis

1. **Binding names are a contract, not a label.** Twelve-plus
   function files and `src/types/env.ts` declare `DB: D1Database`
   and read `env.DB` / `context.env.DB`. Renaming the binding in
   `wrangler.jsonc` without touching a single consumer breaks that
   contract invisibly — no compiler, linter, or build step compares
   the two sides.
2. **The rename had no consumer.** Nothing in the repo references
   `walletwise_db` or `walletwise_storage`; the names were changed
   "for consistency" while the intended production fix (replacing the
   placeholder `database_id` with the real D1 id) was the only change
   that mattered.
3. **Duplicate R2 binding.** Binding the same bucket twice under two
   names is dead configuration at best and a deploy-time validation
   error at worst (`remote` is not a Pages `r2_buckets` property).

## 3. Resolution & Code Changes

`wrangler.jsonc`:

- Restored `"binding": "DB"` for `d1_databases` (kept the real
  production `database_id: "e9d133d0-fe79-41b1-b5e9-0c7c379e2a4d"`
  from `5da2c63` — that part was correct and needed).
- Removed the duplicate `walletwise_storage` R2 entry; the single
  `"binding": "STORAGE"` entry matches `src/types/env.ts` and every
  endpoint's `Env` interface.

## 4. Verification

| Check | Result |
| --- | --- |
| `grep -r "walletwise_db\|walletwise_storage" wrangler.jsonc` | no matches |
| `grep -rn "env.DB" functions/` | 10 call sites, all resolve to the restored binding |
| `npm run build` | green (`tsc -b && vite build`) |
| `wrangler pages dev dist` boots | yes, no config validation errors |
| Signed-out `GET /api/transactions` (live dev server) | `401` with JSON `{"error":"Unauthorized","code":"UNAUTHORIZED"}` — proves `createAuth(context.env.DB)` executed, i.e. the binding resolves at runtime |
| `GET /` static asset | `200` |

Prevention: any change to a binding name in `wrangler.jsonc` must
be grepped against `functions/` and `src/types/env.ts` in the same
commit; CI should run `wrangler pages dev` boot + one authenticated
and one unauthenticated API probe before merging.
