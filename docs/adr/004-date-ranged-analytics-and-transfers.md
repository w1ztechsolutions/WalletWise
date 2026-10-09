# ADR-004: Date-Ranged Analytics + Dedicated Transfers Table

Date: 2026-10-09
Status: Accepted
Author: WalletWise development

## Context

The app needed three remaining features:

1. **Analytics date range** — the dashboard's "Income vs Expenses" chart and the Analytics page served a hard-coded last-6-month window with no way to view more history.
2. **Transfers** — a way to move funds between a user's own accounts so that balances adjust while income/expense totals stay untouched (a transfer is neither income nor expense).
3. **Dashboard graph fix** — the dashboard "Income vs Expenses" chart never rendered data.

## Decision

### 1. Analytics date range

Changed `GET /api/analytics?view=...` to accept a date range:

- `months=N` — N months ending at the current month (1–60, N >= 1). `months=all` returns every month in the table.
- `start=YYYY-MM&end=YYYY-MM` — explicit inclusive window. If both are provided, `months` is ignored.

The API resolves the explicit window into an array of `YYYY-MM` strings, then queries with a **parameterized** `inArray(substr(date,1,7), months)` plus `eq(created_by_id)` via `and()`. The response includes `{ start, end }` so the UI can label the chart.

The `all-time` aggregate queries (totals + top categories) gained the same range filter, keeping summary cards, the pie, and the ranked list consistent with the trend for any selection.

### 2. Transfers

Introduced a dedicated `transfers` table rather than modeling a transfer as paired income/expense transactions:

- `id`, `created_by_id`, `from_account_id`, `to_account_id`, `amount`, `date`, `description`, `notes`, `created_date`, `updated_date`.
- `from_account_id`/`to_account_id` are nullable FKs with `ON DELETE SET NULL`, so deleting an account keeps transfer history as "Deleted account".

Account balance formula changed to:

```
balance = opening_balance
        + SUM(income) - SUM(expense)
        - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = accounts.id), 0)
        + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id   = accounts.id), 0)
```

Analytics queries (`view=overview|monthly|all-time`) deliberately exclude `transfers`, so a transfer is never counted as income or expense.

### 3. Dashboard graph fix

The `IN` clause was built by string-interpolating quoted month literals:

```
substr(date,1,7) IN ('2026-03','2026-04',...)
```

Drizzle bound that whole interpolated string as a single `?` parameter. Since the interpolation produces a comma-separated quoted literal, the bind value was one giant garbage string with no matching month, so every bucket returned 0 and the chart rendered empty. Replaced with Drizzle's `inArray(monthExpr, months)` and `and(eq(created_by_id), inArray(...))`, which sends proper bound parameters. No frontend change was needed for data to populate; the dashboard also gained an explicit empty state ("No data for this period") for the zero-data case.

## Consequences

### Positives
- Users can view any 1–60 month window (or all history) on both the chart and summary.
- One `transfers` table keeps the accounting model clean and prevents double counting in analytics.
- Drizzle-safe `IN` binding fixes the silent empty-chart bug.
- New tab, hooks, and API endpoints are consistent with existing patterns.

### Negatives / Trade-offs
- BottomNav grows from 6 to 7 tabs; on mobile the grid now uses `grid-cols-7` and the "Move" label, so real-estate is tighter (needs a check at actual device widths; a horizontal scroll may be required later if labels wrap).
- Account deletion now keeps the transfer ledger via `SET NULL`; no longer blocks deletion.
- Migrations must be applied (`db:migrate:local` / `db:migrate:remote`) before the new endpoints serve data.
- `months` is clamped at 60; larger ranges would need pagination or a different query shape.

### Verification
- `npx tsc -b` passes.
- `npx oxlint` on `src/components/transfers`, `src/hooks/useTransfers.ts`, `src/hooks/useAnalytics.ts`, `functions/api/transfers`, `functions/api/analytics`, `functions/api/accounts`, `src/App.tsx` = 0 warnings, 0 errors.
- E2E specs for transfers and analytics ranges remain gated on `E2E_EMAIL`/`E2E_PASSWORD` (not run here).