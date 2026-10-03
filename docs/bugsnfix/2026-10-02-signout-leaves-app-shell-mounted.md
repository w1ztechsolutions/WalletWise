# BUG-011: Sign-Out Leaves the Authenticated Shell Mounted With a Stale Session

- **Date:** 2026-10-02
- **Severity:** High (session ended server-side, UI still presents the app; a burst of doomed `401`s follows every sign-out)
- **Component:** `src/components/layout/Sidebar.tsx`, `src/components/auth/AuthGate.tsx`
- **Status:** ✅ Resolved
- **Found by:** Playwright E2E suite (`e2e/auth.spec.ts` — "signs in, restores the session on reload, and signs out")

---

## 1. Symptoms & Error Messages

`POST /api/auth/sign-out` returns `200` and the cookie is genuinely destroyed,
but the app never returns to the sign-in screen. The accessibility snapshot
taken 20s after the click still showed the full authenticated shell:

```yaml
- banner:
  - button "Open navigation sidebar"
  - heading "Dashboard" [level=1]
  - button "Add Record"
- complementary:
  - paragraph: Guest          # <-- but the drawer says "Guest"
  - button "Sign Out"
- main:
  - text: Loading your dashboard…
```

The user drawer reads **"Guest"** while the dashboard, navbar and nav items are
all still live. The request log shows the aftermath:

```
GET /api/auth/get-session  200
GET /api/user/me        401 Unauthorized
GET /api/accounts       401 Unauthorized
GET /api/transactions   401 Unauthorized
GET /api/budgets        401 Unauthorized
GET /api/categories     401 Unauthorized
GET /api/analytics      401 Unauthorized
```

Every mounted data hook fires once with a dead cookie before the 401 teardown
finally unwinds the screen.

---

## 2. Root Cause Analysis

Two independent defects compounded.

**(a) Wrong order — a race with the session read.** `handleSignOut` cleared the
cache *before* calling `signOut()`:

```tsx
// BEFORE
queryClient.clear()
await authClient.signOut()
```

`clear()` immediately re-mounted the `useSession` observer, whose refetch
reached `/api/auth/get-session` **before** the sign-out request had removed the
cookie. That refetch cached a still-valid session, so by the time sign-out
completed, `AuthGate` was reading a session that no longer existed.

**(b) `queryClient.clear()` is the wrong tool here.** In React Query v5,
`clear()` *destroys* each Query and removes it from the cache; it does not reset
it. An already-mounted observer keeps a reference to the destroyed Query object
and continues to be served its last state — `data` included — with no refetch
scheduled. So `AuthGate` never learned the session had ended and kept rendering
`AppContent`.

The 401 teardown in `AuthGate` was papering over this: the failing data requests
fired `UNAUTHORIZED_EVENT`, whose handler eventually cleared things. That is an
accidental recovery path, not a designed one.

---

## 3. Resolution & Code Changes

`Sidebar.handleSignOut` now signs out first, then **invalidates the session in
place** — which refetches the *same* Query instance — and finally drops every
other cached row:

```tsx
const res = await authClient.signOut()
if (res.error) {
  addToast('Sign out failed', res.error.message ?? 'Please try again.', 'error')
  return
}
await queryClient.invalidateQueries({ queryKey: sessionKeys.all })
queryClient.removeQueries({
  predicate: (query) => query.queryKey[0] !== 'session',
})
```

`removeQueries` with a predicate preserves the original security intent from
`SECURITY.md` §2 — no row scoped to the dead session can render for whoever
authenticates next — without destroying the Query the gate is observing.

`AuthGate`'s `UNAUTHORIZED_EVENT` handler carried the identical `clear()` flaw
and could strand the user on an error-filled shell, so it was fixed the same
way.

---

## 4. Verification

| Check | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npm run build` | clean |
| `e2e/auth.spec.ts` → "signs in, restores the session on reload, and signs out" | **fails before, passes after** (desktop and mobile) |
| Full suite, `desktop` + `mobile` | 52/52 passing |

## 5. Prevention Strategy

- **Never use `queryClient.clear()` to react to an auth change.** It destroys
  the Query instance that mounted observers are still reading. Use
  `invalidateQueries` for the session, and `removeQueries({ predicate })` for
  everything else.
- The suite's sign-out spec is the guard: it asserts the auth screen returns
  *and* that `GET /api/user/me` answers `401` afterwards, so a UI-only "fix"
  that leaves the cookie alive still fails.
- `useSession`'s 5-minute `staleTime` means an explicit invalidation is
  mandatory after any credential change — the sign-in path in `AuthView` already
  did this; sign-out did not.
