# BUG-008: Live Deployment Is Three Commits Stale — Authentication Fully Broken in Production

- **Date:** 2026-10-02
- **Severity:** Critical (production is unusable — no user can register or sign in)
- **Component:** Deployment (`wrangler.jsonc` D1 `database_id`), `functions/api/auth/[[all]].ts`
- **Status:** Open (fix already committed at `3871a7c`, never deployed)
- **Found by:** Playwright E2E suite against `https://walletwise-15b.pages.dev/`

---

## 1. Symptoms & Error Messages

`walletwise-15b.pages.dev` serves the SPA correctly — document, JS and CSS
bundles all return `200`, the React root hydrates, and the sign-in screen
renders. The failure is entirely behind the auth gate:

```
POST /api/auth/sign-up/email  ->  500   (empty response body)
POST /api/auth/sign-in/email  ->  500   (empty response body)
```

`wrangler pages deployment tail` on deployment `89b8c89d` shows the real cause:

```
(error) [Better Auth]: TypeError: Cannot read properties of undefined (reading 'prepare')
(error) # SERVER_ERROR:  TypeError: Cannot read properties of undefined (reading 'prepare')
```

A second, independent symptom of the same staleness: anonymous `/api/*`
requests return `{"error":"Unauthorized"}` **without** the documented `code`
field:

```
GET /api/user/me -> 401  {"error":"Unauthorized"}
```

`docs/api/README.md` and `functions/_middleware.ts` both specify
`{"error":"Unauthorized","code":"UNAUTHORIZED"}`.

---

## 2. Root Cause Analysis

The deployment predates the current `main`. `wrangler pages deployment list`
reports `Source: 873f8ac`, while the repository is at `bf3bd08` — three
commits behind:

```
bf3bd08 docs(bugsnfix,adr,api,plan): record BUG-006/BUG-007 and ADR-003
3587e6e feat(api): environment-aware typed error contract (ADR-003)
3871a7c fix(config): restore D1 DB binding and remove duplicate R2 binding   <-- deployed build lacks this
873f8ac update plan.md                                                      <-- what is live
```

`git show 873f8ac:wrangler.jsonc` still carries the **placeholder**
`database_id`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "walletwise-db",
    "database_id": "local-walletwise-db",   // <-- not a real D1 id
    "migrations_dir": "drizzle"
  }
]
```

`3871a7c` replaced it with the real id
`e9d133d0-fe79-41b1-b5e9-0c7c379e2a4d`.

With no resolvable D1 binding, `context.env.DB` is `undefined` at runtime:

1. `functions/api/auth/[[all]].ts` calls `createAuth(context.env.DB)`.
2. `src/lib/auth.ts` runs `drizzle(db)` with that `undefined`.
3. The first real query reaches the D1 driver's session, which calls
   `this.client.prepare(...)` on an `undefined` client —
   `TypeError: Cannot read properties of undefined (reading 'prepare')`.

This is the same failure class already written up as
[BUG-006](./BUG-006-d1-binding-rename-regression.md); that fix landed in the
repository but **was never pushed to the live deployment**, and its "Status:
Resolved" was never re-verified against production.

Note that the middleware short-circuits before D1 for anonymous requests, which
is why `/api/*` still answers `401` while every *write* path dies at the first
database touch.

---

## 3. Resolution / Code Changes

No source change is required — the corrected `wrangler.jsonc` is already on
`main`. The deployment must be rebuilt and republished:

```bash
npm run build
npx wrangler pages deploy dist --project-name walletwise --branch main \
  --commit-dirty=true
```

Expected result after redeploy:

- `POST /api/auth/sign-up/email` → `200` with a user + token
- anonymous `/api/*` → `401 {"error":"Unauthorized","code":"UNAUTHORIZED"}`

Verified against a local `wrangler pages dev` on the *current* `main`, which
returns `200` for both sign-up and sign-in — the code is correct; only the
deployed artefact is stale.

---

## 4. Prevention Strategy

- Run `npm run test:e2e` against the deployed URL in CI so a stale or broken
  artefact fails the build instead of reaching users. The suite's smoke specs
  assert the `401` envelope and the auth lifecycle directly.
- Treat `database_id` / binding names as deploy-time assertions, not build-time
  ones — nothing in `tsc`, Vite, or Oxlint compares `wrangler.jsonc` bindings to
  the `Env` interfaces, which is exactly why BUG-006 could reach a release.
- After any `wrangler pages deploy`, confirm
  `wrangler pages deployment list` reports the intended commit hash.
