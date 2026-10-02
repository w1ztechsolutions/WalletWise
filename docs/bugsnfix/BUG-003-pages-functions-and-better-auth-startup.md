# BUG-003: Pages Functions Bundling and Better Auth Startup Failures

- **Date:** 2026-10-02
- **Severity:** High (blocked every API route)
- **Component:** Cloudflare Pages Functions build, Better Auth on D1
- **Status:** Resolved

---

## 1. Symptoms & Error Messages

Three independent faults, each masking or amplifying the next:

```text
# 1. Invalid catch-all filename — wrangler swallowed the message and exited
functions/api/auth/[...all].ts
[X [ERROR] A Pages Functions filename can not be a catch-all route [...all]
    Note: Catch-all routes are written as [[all]].ts or [[...all]].ts

# 2. Better Auth: Cloudflare context required
Error: Cloudflare context is required for geolocation or IP detection features.
Be sure to pass the `cf` option to the withCloudflare function.

# 3. Better Auth: Drizzle schema mismatch
Missing columns  session.timezone  session.city  session.country
session.region  session.regionCode  session.colo  session.latitude
session.longitude
```

---

## 2. Root Cause Analysis

1. **Filename syntax.** `convertCatchallParams` in wrangler validates the captured
   parameter against `/^[A-Za-z0-9_]+$/`. `[...all]` uses dot-bracket syntax, which
   that pattern rejects; the accepted form is `[[all]].ts` → `/api/auth/:all*`.
2. **`cf` option.** `withCloudflare` throws at config time whenever
   `autoDetectIpAddress` or `geolocationTracking` is enabled (both default `true`)
   and no `cf` value is supplied. `createAuth(db)` had no way to pass one.
3. **Geolocation columns.** With tracking enabled, better-auth-cloudflare expects
   eight optional geo columns on the `session` table. WalletWise's schema
   (`src/db/schema.ts`) does not define them.

---

## 3. Resolution & Code Changes

1. **Renamed** `functions/api/auth/[...all].ts` → `functions/api/auth/[[all]].ts`
   and switched its imports to relative paths (`../../../src/lib/auth`) so the
   Functions bundle resolves them without relying on the Vite `@/` alias.
2. **`src/lib/auth.ts`** — `createAuth(db, cf?)` now accepts the optional Cloudflare
   request context and passes `cf: cf ?? {}`; callers that have a `Request` can
   forward `request.cf` for real geolocation data.
3. **`src/lib/auth.ts`** — added `geolocationTracking: false`, aligning the plugin
   with the existing `session` table (which stores no geo columns). IP detection is
   unaffected: it reads `cf-connecting-ip` / `x-real-ip` headers, and the session
   record was verified to store `ipAddress` in smoke testing.

---

## 4. Verification

`wrangler pages functions build` reports `✨ Compiled Worker successfully`, and a
live `wrangler pages dev` session confirms:

| Check | Result |
| --- | --- |
| `GET /api/auth/get-session` (anonymous) | `200` + `null` |
| `POST /api/auth/sign-up/email` | `200` + session cookie |
| `GET /api/auth/get-session` (cookie) | `200` + user, `ipAddress: 127.0.0.1` |
| `POST /api/storage/upload-url` (anonymous) | `401` |