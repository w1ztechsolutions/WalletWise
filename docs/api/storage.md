# R2 Storage API (Phase 6.5)

Private, user-scoped object storage for transaction receipts and archived
spreadsheets. The bucket (`walletwise-storage`) is **never** publicly readable;
all access goes through 15-minute S3 presigned URLs generated server-side with
`aws4fetch` (SigV4) — see `src/lib/storage.ts`.

> **Why S3 presigning instead of the R2 binding?** The R2 Workers binding does
> not expose a signed-URL method (still an open feature request), so true
> presigned URLs require S3 API credentials as worker secrets. All object
> operations (PUT/GET/DELETE) therefore target the account's real S3 endpoint,
> which keeps behavior identical between `wrangler pages dev` and production.

## Key layout

```text
users/{userId}/receipts/{uuid}-{sanitizedName}   # transaction receipts   (≤ 5MB)
users/{userId}/imports/{uuid}-{sanitizedName}    # spreadsheet archives   (≤ 10MB)
```

Ownership = prefix check against the session user; anything else returns `404`.

## `POST /api/storage/upload-url`

Request:

```json
{ "kind": "receipt", "fileName": "shop.png", "contentType": "image/png", "contentLength": 12345 }
```

- `kind`: `receipt` (pdf/png/jpg/jpeg/webp, ≤ 5MB) or `import` (xlsx/xls/csv, ≤ 10MB).
- Validation (extension whitelist + MIME + size) happens server-side in
  `parseUploadRequest()`; the client pre-checks with `validateFileForKind()`.

Response `200`:

```json
{ "uploadUrl": "https://<accountId>.r2.cloudflarestorage.com/...", "key": "users/...", "method": "PUT", "contentType": "image/png", "expiresIn": 900 }
```

Client then performs a direct `PUT uploadUrl` with the file body.

Errors: `400` invalid input · `401` unauthenticated · `503` R2 secrets missing.

## `GET /api/storage/download-url?key=users/{userId}/...`

Returns `{ "downloadUrl", "key", "expiresIn": 900 }`. Foreign or malformed keys
→ `404`. The client opens the URL in a new tab (top-level navigation needs no
CORS).

## `DELETE /api/storage/object?key=users/{userId}/...`

Deletes the object (used when a receipt is removed/replaced or a transaction is
deleted). Returns `{ "success": true, "key" }`; `404` from R2 is treated as
success (idempotent). Like uploads, this issues a presigned DELETE against the
same S3 endpoint for consistency.

## Configuration

| Variable | Kind | Purpose |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | secret | Account id (S3 endpoint host) |
| `R2_ACCESS_KEY_ID` | secret | R2 S3 API token access key |
| `R2_SECRET_ACCESS_KEY` | secret | R2 S3 API token secret |
| `R2_BUCKET_NAME` | var (`wrangler.jsonc`) | Bucket name, default `walletwise-storage` |

Local dev: copy `.dev.vars.example` → `.dev.vars`. Production:
`npx wrangler secret put R2_ACCOUNT_ID` (etc.).

Browser `PUT` uploads are cross-origin, so apply the bucket CORS policy once
(the file uses Wrangler's `rules` format; `DELETE` is required for the
presigned object-removal path and any future browser-side deletes):

```bash
npx wrangler r2 bucket cors set walletwise-storage --file r2-cors.json
npx wrangler r2 bucket cors list walletwise-storage   # verify
```

`r2-cors.json` (Wrangler `rules` format — the R2 API / dashboard JSON
shape, not the legacy PascalCase array):

```json
{
  "rules": [
    {
      "allowed": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173",
                    "http://localhost:8788", "http://127.0.0.1:8788",
                    "https://*.pages.dev"],
        "methods": ["GET", "PUT", "HEAD", "DELETE"],
        "headers": ["*"]
      },
      "exposeHeaders": ["ETag"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

(Adjust `origins` to your final Pages domain.)
