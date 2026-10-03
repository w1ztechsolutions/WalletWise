# BUG-009: Authentication Failures Are Silently Swallowed — Sign-In Appears to Do Nothing

- **Date:** 2026-10-02
- **Severity:** High (no user feedback on any credential failure; looks like a broken button)
- **Component:** `src/components/auth/AuthView.tsx`, `src/components/layout/Sidebar.tsx`
- **Status:** ✅ Resolved
- **Found by:** Playwright E2E suite (`e2e/auth.spec.ts` — "rejects bad credentials with a visible error")

---

## 1. Symptoms & Error Messages

Entering a wrong password (or an unknown account, or hitting any server-side
error) and pressing **Sign In**:

- the button shows `Please wait…` for ~2s,
- then returns to `Sign In`,
- **no error message, no toast, no shake, no navigation.**

The page looks exactly as if the click did nothing. Meanwhile the network log
clearly shows a rejection:

```
POST /api/auth/sign-in/email -> 401 {"message":"Invalid email or password",
                                     "code":"INVALID_EMAIL_OR_PASSWORD"}
```

Reproduced against a **correctly working backend** (`wrangler pages dev` on the
current `main`, which returns `200` for valid credentials), so this is
independent of the deployment staleness recorded in
[BUG-008](./2026-10-02-stale-deployment-breaks-production-auth.md).

`Sidebar.handleSignOut` had the same defect in the opposite direction: it
reported **"Signed out"** without inspecting the result, so a failed sign-out
was indistinguishable from a successful one.

---

## 2. Root Cause Analysis

Better Auth's client methods **resolve with an `error` property instead of
rejecting**. `AuthView.handleSubmit` only handled the rejecting case:

```tsx
// BEFORE
try {
  if (isSignUp) {
    await authClient.signUp.email({ name, email, password });
  } else {
    await authClient.signIn.email({ email, password });
  }
  await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
} catch (err) {
  setError(describeError(err));   // <-- never reached for a 401
} finally {
  setIsPending(false);
}
```

For `401 INVALID_EMAIL_OR_PASSWORD` the promise resolves as
`{ data: null, error: { message, code } }`. No exception is thrown, the `catch`
branch never executes, `setError()` is never called, and the `error && (...)`
block that renders the `role="alert"` box stays unmounted. The user gets
absolute silence.

The same applies to `signUp.email`, so duplicate-email and weak-password
responses from the server are equally invisible; only the three client-side
pre-checks in `handleSubmit` produce any feedback at all.

---

## 3. Resolution & Code Changes

`src/components/auth/AuthView.tsx` — each result is now inspected and its error
promoted to a throw, keeping the single `catch` as the one place that turns a
failure into user-visible text:

```tsx
if (isSignUp) {
  const res = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
  if (res.error) throw res.error;
} else {
  const res = await authClient.signIn.email({ email: email.trim(), password });
  if (res.error) throw res.error;
}
```

`src/components/layout/Sidebar.tsx` — `handleSignOut` now checks its result and
reports a failure instead of claiming success:

```tsx
const res = await authClient.signOut()
if (res.error) {
  addToast('Sign out failed', res.error.message ?? 'Please try again.', 'error')
  return
}
```

---

## 4. Verification

| Check | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npm run lint` | 0 errors |
| `e2e/auth.spec.ts` → "rejects bad credentials with a visible error" | **fails before, passes after** (verified against `wrangler pages dev`) |
| Full suite, desktop + mobile | 52/52 passing |

## 5. Prevention Strategy

- `e2e/auth.spec.ts` asserts a visible `role="alert"` after a failed sign-in and
  that the auth screen stays mounted. This is the regression guard.
- **Never treat an `authClient.*` call as successful merely because it did not
  throw** — always inspect the resolved `error`. All four call sites were
  audited: `useSession.getSession` already handles it defensively (`res?.data
  ?? null`, which correctly degrades to "anonymous"), `AuthGate`'s teardown
  `signOut` is fire-and-forget on an already-dead session, and the two fixed
  above are the interactive ones.
- The sign-out fix's failure path was additionally hardened under
  [BUG-011](./2026-10-02-signout-leaves-app-shell-mounted.md).
