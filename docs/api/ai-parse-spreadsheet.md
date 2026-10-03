# Workers AI Spreadsheet Parser (Phase 6.6)

`POST /api/ai/parse-spreadsheet` normalizes spreadsheet rows into
transactions/budgets using Cloudflare Workers AI
(`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) behind `functions/api/ai/parse-spreadsheet.ts`.

## Request

```json
{
  "fileName": "october.xlsx",
  "defaultDate": "2026-10-02",
  "defaultMonth": "2026-10",
  "sheets": [
   { "name": "Transactions", "rows": [ { "Date": "2026-10-01", "Amount": "1,250.00", "Description": "Rent", "Category": "Housing", "Type": "expense", "Account": "Daily Checking" } ] },
    { "name": "Budget", "rows": [ { "Month": "2026-10", "Category": "Groceries", "Planned": "500" } ] }
  ]
}
```

Limits: ≤ 10 sheets, ≤ 2,000 rows total, ≤ 512 KB body, ≤ 30 columns/row,
cells truncated to 300 chars (enforced server-side; `413` when exceeded).
The transaction `Account` column is optional; when absent, the normalized
transaction has an empty account name and remains unlinked.
When an account or wallet column is present, deterministic column matching is
used for that sheet chunk so an explicit account value is not lost to AI
normalization.

## Processing pipeline

1. **Chunking** — rows are split into chunks of 25. The chunk size is sized for
   the smallest supported JSON-mode model window (7,968 tokens on the 8B Llama
   family) so prompt + output stay comfortably inside the limit regardless of
   which model the AI binding routes the request to.
2. **AI call** — each chunk runs through `env.AI.run(MODEL, { messages,
   response_format: { type: "json_object" }, temperature: 0, max_tokens: 2000 })`.
   Output is fence-stripped, `{…}`-extracted, and `JSON.parse`d (one retry).
   Response bodies are normalized by `readModelText()`, which handles the
   legacy `string | { response: string }` shape as well as the newer
   `{ response: { content: [{ type: "text", text }] } }` and
   `{ choices: [{ message: { content } }] }` shapes.
3. **Validation** — every record must satisfy: positive finite amount,
   `YYYY-MM-DD` date / `YYYY-MM` month, `income|expense` type; invalid records
   are dropped and counted in `stats.dropped`.
4. **Deterministic fallback** — if a chunk's model call fails or returns
   non-JSON, that chunk runs through `normalizeSheets()` (shared with the
   client) so the import never hard-fails. Only the first **24 chunks** use the
   model; the remainder use the deterministic parser to bound request latency.
   If the AI binding is missing/unreachable, `source` becomes `"fallback"`.

A sheet named `*budget*` produces budgets; everything else produces transactions.

## Response `200`

```json
{
   "transactions": [ { "date": "2026-10-01", "amount": 1250, "description": "Rent", "category": "Housing", "account": "Daily Checking", "type": "expense", "is_recurring": false } ],
  "budgets": [ { "month": "2026-10", "category": "Groceries", "planned_amount": 500 } ],
  "warnings": [],
  "stats": { "sheets": 2, "rows": 31, "chunks": 2, "aiChunks": 2, "fallbackChunks": 0, "dropped": 0 },
  "source": "ai",
  "fileName": "october.xlsx"
}
```

`source`: `ai` | `fallback` | `mixed`.

## Client integration (`SettingsView`)

1. SheetJS reads the workbook into row objects (kept client-side; the raw file
   is also archived to R2 via `POST /storage/upload-url`, best-effort).
2. Rows are posted here; `category` **names** returned by the server are
   matched against the user's categories (missing ones are created once via a
   local cache) and turned into `category_id`s. Optional account names are
   matched case-insensitively to a unique existing account; missing, unknown,
   or ambiguous names remain unlinked. Account IDs are validated again by
   `POST /api/import` against the authenticated user.
3. Records are committed through `batchImport()`.
4. If this endpoint is unreachable (e.g. plain `npm run dev` without Pages
   Functions), the client calls `normalizeSheets()` directly — same engine as
   the server fallback, so results are consistent.

Errors: `400` invalid payload · `401` unauthenticated · `413` too large ·
`500` unexpected (sanitized message).
