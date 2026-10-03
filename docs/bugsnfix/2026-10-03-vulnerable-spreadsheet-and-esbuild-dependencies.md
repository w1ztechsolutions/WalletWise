# BUG-014: Vulnerable Spreadsheet and esbuild Dependencies

- **Date:** 2026-10-03
- **Severity:** High
- **Component:** Spreadsheet import dependency and Drizzle Kit dependency tree
- **Status:** Resolved

---

## 1. Symptoms & Error Message

`npm audit` reported five vulnerabilities: four moderate findings from an old nested esbuild under Drizzle Kit, and two high-severity advisories against the direct `xlsx` dependency used to parse uploaded workbooks.

## 2. Root Cause Analysis

The project depended on `xlsx@0.18.5` from the npm registry. That registry package is stale and affected by SheetJS prototype-pollution and ReDoS advisories. Drizzle Kit's `@esbuild-kit/esm-loader` also resolved `@esbuild-kit/core-utils`, which bundled vulnerable `esbuild@0.18.20`.

## 3. Resolution & Code Changes

- Replaced the npm registry dependency with SheetJS's official `xlsx@0.20.3` CDN tarball in `package.json` and the lockfile.
- Added a scoped npm override for `@esbuild-kit/core-utils` to resolve patched `esbuild@0.25.12` without downgrading Drizzle Kit.

## 4. Verification

- `npm install` completed and reported zero vulnerabilities.
- `npm audit` reported zero vulnerabilities.
- `npm ls xlsx drizzle-kit @esbuild-kit/core-utils esbuild --depth=3` confirmed `xlsx@0.20.3` and `esbuild@0.25.12` under the Drizzle loader.
- `npm run db:generate` completed and reported no schema changes.
- `npm run build` completed successfully.

## 5. Prevention Strategy

- Run `npm audit` after dependency changes and review package provenance when npm's registry metadata is stale.
- Avoid `npm audit fix --force` when its proposed remediation downgrades a required tool; use narrow overrides and validate the affected tool's commands instead.
- Keep `package-lock.json` committed so CI and deployments resolve the verified dependency tree.
