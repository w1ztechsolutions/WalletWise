# WalletWise API Contracts

Edge API documentation for the Cloudflare Pages Functions under `/functions/api/`.

| Document | Endpoints |
| --- | --- |
| [storage.md](./storage.md) | `POST /api/storage/upload-url`, `GET /api/storage/download-url`, `DELETE /api/storage/object` |
| [ai-parse-spreadsheet.md](./ai-parse-spreadsheet.md) | `POST /api/ai/parse-spreadsheet` |

## Conventions

- **Auth:** every `/api/*` route except `/api/auth/*` is session-gated by
  `functions/_middleware.ts` and returns `401 { "error": "Unauthorized",
  "code": "UNAUTHORIZED" }` without a valid Better Auth cookie. The resolved
  `userId` is injected into `context.data.userId`; handlers additionally fall
  back to `getAuthUser()` (per-endpoint session resolution).
- **Errors:** `{ "error": "<sanitized message>", "code": "<ErrorCode>" }`
  with an appropriate 4xx/5xx status. `code` is a stable machine-readable
  value (`BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, …) — see
  `functions/lib/errors.ts` and `ADR-003`. An optional `details` field
  (stack trace, D1 text) is included **only** when the runtime `ENVIRONMENT`
  variable is exactly `"development"`; the module fails closed, so a missing
  or misspelled var behaves as production (SECURITY.md §7). Internal details
  are always logged server-side as structured JSON with a per-request
  `requestId`.
- **Unhandled failures:** every handler is wrapped by `withErrorHandling()`
  and the middleware guards `context.next()`, so no rejection escapes as
  Cloudflare's opaque HTML 500 page; the client always gets the JSON
  envelope above.
- **Isolation:** every object key and database query is scoped to the
  authenticated user (SECURITY.md §2); missing records return `404`, never `403`.
