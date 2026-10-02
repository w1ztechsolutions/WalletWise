# BUG-004: Deprecated Workers AI Model Silently Disabled All AI Parsing

- **Date:** 2026-10-02
- **Severity:** High (feature non-functional, no user-visible error)
- **Component:** `functions/api/ai/parse-spreadsheet.ts`
- **Status:** Resolved

---

## 1. Symptoms & Error Message

Every import fell back to the deterministic column-matcher. Server log:

```text
Workers AI chunk failed, using deterministic fallback:
InferenceUpstreamError [AiError]: 5028: @cf/meta/infire-llama-3.1-8b-instruct
was deprecated on 2026-05-30.
```

After switching to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, a second fault
appeared: `TypeError: text2.trim is not a function`.

---

## 2. Root Cause Analysis

1. `@cf/meta/llama-3.1-8b-instruct` was **deprecated on 2026-05-30** and now
   resolves to a retired alias. Because the endpoint has a deterministic fallback
   by design, this surfaced only as `source: "fallback"` plus a server-side log —
   the API still returned `200`, so the feature looked alive while doing no AI work.
2. The 70B FP8 model returns `{ response: { content: [{ type: "text", text }] } }`
   rather than the older `{ response: "..." }` string, so `extractJson()` was
   handed an object.

---

## 3. Resolution & Code Changes

1. `MODEL` switched to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (listed in the
   Workers AI JSON Mode supported-models table).
2. Added `readModelText()`, which normalizes the legacy string shape, the newer
   `response.content[]` shape, and OpenAI-style `choices[].message.content`.
3. Docs/PLAN.md model references updated to match.

---

## 4. Verification

Live `wrangler pages dev` run against real Workers AI:

| Input | Result |
| --- | --- |
| Clean `Date`/`Amount`/`Category` rows | `source: "ai"`, `aiChunks: 1`, no warnings |
| Messy headers (`Txn Date`, `Payee`, `Total Cost: "$32.10"`) | `05/10/2026` → `2026-10-05`, `$` stripped |
| Negative amount (`-15.00`, "Refund") | normalized to `income`, amount `15` |
| Sheet named `Budget 2026` | emitted into `budgets`, `transactions: []` |

The messy-input cases are exactly what the deterministic parser cannot do, so they
confirm the AI path — not the fallback — is now doing the work.