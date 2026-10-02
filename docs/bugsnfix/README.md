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
