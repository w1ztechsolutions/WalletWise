# Bug Reports & Fixes Log

This directory tracks all encountered issues, build/runtime bugs, edge cases, root cause analyses, and solutions implemented during the development and maintenance of **WalletWise**.

---

### [BUG-001] Git dubious ownership detection on Windows during repository initialization
- **Date:** 2026-10-02
- **Severity:** Low
- **Symptoms / Error Message:**
  ```text
  fatal: detected dubious ownership in repository at 'C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise'
  ```
- **Root Cause:**
  Git security protections (CVE-2022-24765) prevent Git operations across different Windows user SID directory owners.
- **Fix Implemented:**
  Executed `git config --global --add safe.directory "C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise"`.
- **Verification:**
  `git status` and `git commit` succeeded immediately.

---

### [BUG-002] TypeScript 6 build errors with deprecated baseUrl and extension imports
- **Date:** 2026-10-02
- **Severity:** Medium
- **Symptoms / Error Message:**
  ```text
  error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
  error TS5097: An import path can only end with a '.tsx' extension when 'allowImportingTsExtensions' is enabled.
  ```
- **Root Cause:**
  TypeScript 6.0 deprecates `baseUrl` when standard path mappings are used, and Vite template default `main.tsx` included an explicit `.tsx` file extension in the import statement.
- **Fix Implemented:**
  1. Removed `baseUrl` from `tsconfig.app.json` while retaining `"@/*": ["./src/*"]`.
  2. Changed `import App from './App.tsx'` to `import App from './App'` in `src/main.tsx`.
- **Verification:**
  `npm run build` passes with zero errors.
