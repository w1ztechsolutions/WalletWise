# WalletWise API Contracts

Edge API documentation for the Cloudflare Pages Functions under `/functions/api/`.

| Document | Endpoints |
| --- | --- |
| [storage.md](./storage.md) | `POST /api/storage/upload-url`, `GET /api/storage/download-url`, `DELETE /api/storage/object` |
| [ai-parse-spreadsheet.md](./ai-parse-spreadsheet.md) | `POST /api/ai/parse-spreadsheet` |

## Conventions

- **Auth:** every `/api/*` route except `/api/auth/*` is session-gated by
  `functions/_middleware.ts` and returns `401 { "error": "Unauthorized" }`
  without a valid Better Auth cookie. The resolved `userId` is injected into
  `context.data.userId`; handlers additionally fall back to
  `getAuthUser()` (per-endpoint session resolution).
- **Errors:** `{ "error": "<sanitized message>" }` with an appropriate 4xx/5xx
  status. Internal details are logged server-side only (SECURITY.md §7).
- **Isolation:** every object key and database query is scoped to the
  authenticated user (SECURITY.md §2); missing records return `404`, never `403`.
