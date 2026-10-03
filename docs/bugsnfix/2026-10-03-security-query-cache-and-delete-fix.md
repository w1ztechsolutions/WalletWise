# BUG-013: Security hardening and per-user cache isolation

- **Date:** 2026-10-03
- **Severity:** High
- **Component:** React Query cache keys, account number persistence, delete handlers
- **Status:** Resolved

---

## 1. Symptoms & Error Messages

The audit surfaced three concrete issues in the live app behavior and the client/server boundary:

1. The browser masked account numbers, but the API accepted and stored full card numbers without server-side normalization.
2. React Query keys did not include the authenticated user identity, creating a cross-tab leakage risk on shared devices.
3. `DELETE` handlers returned a successful payload even when no row was actually deleted, which made the API response ambiguous and inconsistent with the documented not-found flow.

These issues were visible in the runtime contract and in the audit evidence, and the build also surfaced a type mismatch when the query-key refactor was applied without updating the bulk import invalidation logic.

## 2. Root Cause Analysis

The root problems were all at the boundary between UI cache state and server-side authorization:

- `account_number` was only masked in the client before persistence; the API handlers in `functions/api/accounts/index.ts` and `functions/api/accounts/[id].ts` stored the raw string as-is.
- All major query groups were using unscoped keys such as `["transactions"]`, `["accounts"]`, and `["user"]`, so one authenticated tab could share stale data with another tab for the same browser profile if the data was still cached.
- Delete handlers called `.delete(...)` and returned `{ success: true }` unconditionally, without checking whether any row was affected.
- The bulk import hook used the old unscoped key factory shape, which caused TypeScript errors after the user-scoped refactor and revealed a missing invalidation path.

## 3. Resolution & Code Changes

The fix was implemented in both the client and the API layers:

- Added `normalizeAccountNumber()` and applied it in the create and update account endpoints so stored account numbers are reduced to the last four digits (after stripping non-digit characters).
- Updated all main query-key factories to include the current authenticated user ID, and ensured invalidation targets the current user's namespace.
- Updated `useBulkImport()` to invalidate the user-scoped keys instead of the legacy global keys.
- Updated delete handlers to use `.returning()` and return `404` when zero rows were affected.
- Added the user-aware session dependency to the relevant hooks so the cache is scoped consistently for the active user.

## 4. Verification

Fresh verification was run after the fix:

- `npm run build` completed successfully
- `npx playwright test e2e/smoke.spec.ts --reporter=line`

Result:

```text
Running 10 tests using 1 worker
  10 passed (1.4m)
```

This verifies the app still bootstraps correctly and the anonymous-request smoke checks remain green after the changes.

## 5. Prevention Strategy

- Treat browser-side masking as UX only; always normalize and validate sensitive fields on the server.
- Require every user-scoped query key to include the authenticated user ID.
- Validate the affected-row count on destructive endpoints before returning a success payload.
- Keep stale query-key factories in sync with imported hooks by running a full TypeScript build after any cache-layer refactor.
- Maintain smoke-test coverage for anonymous API access and deploy-time integrity checks to catch regressions before release.
