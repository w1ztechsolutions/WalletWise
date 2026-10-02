# BUG-002: TypeScript 6 Build Errors with Deprecated BaseUrl and Extension Imports

- **Date:** 2026-10-02
- **Severity:** Medium
- **Component:** TypeScript Compiler & Build System (`tsconfig.app.json`, `main.tsx`)
- **Status:** Resolved

---

## 1. Symptoms & Error Message

Running `npm run build` failed during `tsc -b`:

```text
tsconfig.app.json(17,5): error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.
src/main.tsx(4,17): error TS5097: An import path can only end with a '.tsx' extension when 'allowImportingTsExtensions' is enabled.
```

---

## 2. Root Cause Analysis

1. **`baseUrl` Deprecation:** TypeScript 6.0 deprecates `baseUrl` when path mapping aliases (`paths`) can resolve relative to the configuration file root directly.
2. **Explicit `.tsx` Extension:** The default template scaffolding imported `App` with an explicit file extension: `import App from './App.tsx'`, which violates standard bundler module resolution unless `allowImportingTsExtensions` is toggled on.

---

## 3. Resolution & Code Changes

1. **`tsconfig.app.json`:**
   Removed `"baseUrl": "."` and mapped `"@/*": ["./src/*"]` directly.
2. **`src/main.tsx`:**
   Changed import from `./App.tsx` to `./App`.

---

## 4. Verification

`npm run build` and `tsc -b` completed with zero compiler errors.
