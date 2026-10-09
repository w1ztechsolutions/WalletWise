# Bug Reports & Fixes Log

This directory tracks all encountered issues, build/runtime bugs, edge cases, root cause analyses, and solutions implemented during the development and maintenance of **WalletWise**.

Each bug is documented in its own individual file following the naming pattern: `BUG-XXX-short-description.md`.

---

## Bug Index

| ID | File | Severity | Status | Date |
| :-- | :-- | :-- | :-- | :-- |
| BUG-001 | [BUG-001-git-dubious-ownership.md](./BUG-001-git-dubious-ownership.md) | Low | ✅ Resolved | 2026-10-02 |
| BUG-002 | [BUG-002-typescript-6-config-and-imports.md](./BUG-002-typescript-6-config-and-imports.md) | Medium | ✅ Resolved | 2026-10-02 |
| BUG-003 | [BUG-003-pages-functions-and-better-auth-startup.md](./BUG-003-pages-functions-and-better-auth-startup.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-004 | [BUG-004-deprecated-workers-ai-model.md](./BUG-004-deprecated-workers-ai-model.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-005 | [BUG-005-dead-hooks-and-unwired-backend.md](./BUG-005-dead-hooks-and-unwired-backend.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-006 | [BUG-006-d1-binding-rename-regression.md](./BUG-006-d1-binding-rename-regression.md) | Critical | ✅ Resolved | 2026-10-02 |
| BUG-007 | [BUG-007-error-contract-wip-build-break.md](./BUG-007-error-contract-wip-build-break.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-008 | [2026-10-02-stale-deployment-breaks-production-auth.md](./2026-10-02-stale-deployment-breaks-production-auth.md) | Critical | ✅ Resolved | 2026-10-02 |
| BUG-009 | [2026-10-02-auth-failures-silently-swallowed.md](./2026-10-02-auth-failures-silently-swallowed.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-010 | [2026-10-02-modal-dialogs-overflow-mobile-viewport.md](./2026-10-02-modal-dialogs-overflow-mobile-viewport.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-011 | [2026-10-02-signout-leaves-app-shell-mounted.md](./2026-10-02-signout-leaves-app-shell-mounted.md) | High | ✅ Resolved | 2026-10-02 |
| BUG-012 | [2026-10-03-production-d1-migration-pending.md](./2026-10-03-production-d1-migration-pending.md) | Critical | ✅ Resolved | 2026-10-03 |
| BUG-013 | [2026-10-03-security-query-cache-and-delete-fix.md](./2026-10-03-security-query-cache-and-delete-fix.md) | High | ✅ Resolved | 2026-10-03 |
| BUG-014 | [2026-10-03-vulnerable-spreadsheet-and-esbuild-dependencies.md](./2026-10-03-vulnerable-spreadsheet-and-esbuild-dependencies.md) | High | ✅ Resolved | 2026-10-03 |

> **BUG-006 is marked Resolved in the repository but was still live in
> production.** The fix (`3871a7c`) was committed and never deployed; see
> BUG-008. "Resolved" in this index means "fixed in source", not "fixed for
> users" — verify with `npm run test:e2e` against the deployed URL.

> **BUG-009 → BUG-011 were found by the Playwright suite introduced in
> [ADR-004](../adr/004-playwright-e2e-suite-against-deployed-pages.md)**, not by
> review. All three are regressions guarded by specs in `e2e/`.

---

## Adding a New Bug Report

Create a new file: `docs/bugsnfix/BUG-XXX-short-description.md` using this template:

```markdown
# BUG-XXX: Short Descriptive Title

- **Date:** YYYY-MM-DD
- **Severity:** Low | Medium | High | Critical
- **Component:** Affected file or module
- **Status:** Investigating | Resolved

---

## 1. Symptoms & Error Message

## 2. Root Cause Analysis

## 3. Resolution & Code Changes

## 4. Verification
```

Then add a row to the Bug Index table above.
