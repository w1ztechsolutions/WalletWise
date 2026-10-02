# BUG-007: Error-Contract WIP Broke the Build — Split Interface, Spliced Imports, Duplicate Members

- **Date:** 2026-10-02
- **Severity:** High (build failure; would have blocked any commit had it been run)
- **Component:** `functions/lib/errors.ts`, `functions/api/**` (5 import sites), 13 endpoint `Env` interfaces, `functions/_middleware.ts`
- **Status:** Resolved

---

## 1. Symptoms & Error Message

`npm run build` (`tsc -b`) failed with three distinct error classes:

```text
functions/lib/errors.ts(139,1): error TS1131: Property or signature expected.
functions/lib/errors.ts(234,1): error TS1109: Expression expected.
functions/lib/errors.ts(235,1): error TS1128: Declaration or statement expected.

functions/api/ai/parse-spreadsheet.ts(4,8): error TS1005: ',' expected.
functions/api/import/index.ts(5,1): error TS1003: Identifier expected.
functions/api/storage/{object,upload-url,download-url}.ts: same TS1005/TS1003 pattern

functions/api/accounts/[id].ts(10,3): error TS2300: Duplicate identifier 'ENVIRONMENT'.
… (12 more files, same duplicate)

functions/_middleware.ts(72,7): error TS2322: Type 'unknown' is not
assignable to type 'string | undefined'.
```

## 2. Root Cause Analysis

The typed-error-contract change was applied mechanically, file by
file, without a compile between edits:

1. **Split interface (`errors.ts`).** `ApiErrorOptions` was opened,
   then `ErrorContext` and four functions were written *inside* its
   body, and the real `details?: string` member plus the closing brace
   were orphaned at EOF. The interface had been interrupted mid-body
   by a paste.
2. **Spliced imports (5 files).** `import { withErrorHandling }` was
   inserted *between* the `import {` opener and the member list of
   existing multi-line imports (`parse-spreadsheet.ts`,
   `import/index.ts`, `storage/{upload-url,download-url,object}.ts`),
   producing `import { import { … }`.
3. **Duplicate members (13 files).** `ENVIRONMENT?: string;` was
   appended to `Env` interfaces that already declared it.
4. **Untyped `context.data` (`_middleware.ts`).**
   `context.data.requestId` is `unknown`; assigning it directly to
   `ErrorContext.requestId?: string` fails `TS2322`.

## 3. Resolution & Code Changes

- `functions/lib/errors.ts` — closed `ApiErrorOptions` properly
  (with its `details` member) before `ErrorContext`; removed the
  orphaned trailing block.
- 5 endpoint files — moved `import { withErrorHandling }` to its own
  statement above the multi-line import it was spliced into.
- 13 endpoint files — de-duplicated the `ENVIRONMENT?: string;`
  member (also removed a doubled line in `import/index.ts`).
- `functions/_middleware.ts` — guarded the assignment:
  `typeof context.data.requestId === "string" ? … : undefined`.

## 4. Verification

| Check | Result |
| --- | --- |
| `npm run build` | green (`tsc -b && vite build`, 2578 modules) |
| `npm run lint` | only pre-existing warnings (unused icon imports, `Date` purity) |
| Standalone `tsc` on `errors.ts` | no errors (TS1131/TS1109/TS1128 gone) |
| Signed-out `GET /api/transactions` on `wrangler pages dev` | `401` JSON envelope (the wrapped handlers and middleware guard execute) |

Prevention: run `npm run build` after every multi-file mechanical
edit, before the edit batch grows; never commit a red tree.
