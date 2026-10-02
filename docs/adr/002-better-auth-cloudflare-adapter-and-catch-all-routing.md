# ADR 002: Better Auth Wiring on Cloudflare D1 — `better-auth-cloudflare` and the `[[all]].ts` Catch-All

## Status
Accepted

## Date
2026-10-02

## Context

`PLAN.md` §1 and Phase 2 specified installing `@better-auth/d1-adapter` to run Better Auth
on Cloudflare D1, mounted through `functions/api/auth/`.

Two properties of this project make that choice awkward:

1. **The schema is Drizzle's, and is shared.** Better Auth's four tables (`user`, `session`,
   `account`, `verification`) live in `src/db/schema.ts` alongside the application's own
   tables, and the whole database is accessed through a Drizzle instance built on the bound
   `D1Database`. A standalone adapter would introduce a second, independent schema mapping
   over the same SQLite file, and any drift between the two would surface as runtime column
   errors rather than type errors.
2. **Pages Functions routes are file-based.** Better Auth serves many endpoints under
   `/api/auth/*` (`sign-up`, `sign-in`, `sign-out`, `get-session`, callbacks), so the mount
   point has to be a catch-all. The filename therefore has to satisfy both Cloudflare's
   routing convention and wrangler's parameter-name rules.

## Decision

1. **Adapter: `better-auth-cloudflare`, via `withCloudflare`.** The existing Drizzle
   instance is passed straight through:

   ```ts
   withCloudflare({
     cf: cf ?? {},
     geolocationTracking: false,
     d1: {
       db: drizzleDb,
       options: { schema: { user, session, account, verification } },
     },
   })
   ```

   The project's Drizzle schema stays the single source of truth for the auth tables.

2. **`geolocationTracking: false`.** The library's geolocation tracking expects optional
   `city` / `country` / `colo` / … columns on the `session` table, which WalletWise's
   `session` table does not carry. Turning tracking on would fail against the current
   schema. IP detection still works through headers, configured independently:

   ```ts
   advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"] } }
   ```

3. **`cf` is always provided, defaulting to `{}`.** The wrapper requires a truthy `cf`
   value, so `createAuth(db, cf?)` substitutes an empty all-optional object when
   `request.cf` is unavailable rather than failing every request with
   "Cloudflare context is required".

4. **Catch-all named `[[all]].ts`, not `[[...all]].ts`.** `functions/api/auth/[[all]].ts`
   handles every `/api/auth/*` path. Cloudflare requires the double-bracket catch-all form,
   but wrangler accepts only alphanumeric/underscore parameter names and rejects
   bracket-dots, so the single-parameter form is the one that builds.

5. **Cookie naming lives under `advanced.cookies.session_token`.** The session cookie is
   renamed from Better Auth's default `better-auth.session_token` to `walletwise_session`.
   This is keyed by the cookie's *internal* name (`session_token`); a top-level `cookie`
   block is silently ignored and leaves the default name in place.

## Consequences

### Positive
- **No duplicate schema mapping.** Auth tables and application tables are defined once, in
  `src/db/schema.ts`, and are type-checked together.
- **Zero-cost geolocation available later.** Adding the optional columns to `session` and
  flipping `geolocationTracking` is a self-contained change; no adapter migration needed.
- **Client IP and user-agent capture** work through headers, independent of geolocation.
- **The cookie rename and its `HttpOnly` / `SameSite=Lax` / `Path=/` attributes are
  explicit**, so losing `httpOnly` cannot happen silently and the session token is never
  exposed to script.

### Negative / Considerations
- `geolocationTracking` must remain `false` until the `session` table gains the optional
  geolocation columns; flipping it earlier breaks session writes.
- The `cf` fallback to `{}` is load-bearing, not defensive noise — omitting it turns every
  request into "Cloudflare context is required".
- Cookie configuration is not discoverable from the type signature: a misplaced
  `cookie` block fails silently, keeping the default cookie name rather than raising an
  error. See `BUG-005` for the session work this ADR sits inside.
- The `[[all]].ts` filename is non-obvious at a glance; the reason is documented in a
  comment at the top of the route file so it is not "corrected" to `[[...all]].ts` later.
