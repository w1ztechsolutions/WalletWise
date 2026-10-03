# BUG-012: Production D1 Migration Was Pending

- **Date:** 2026-10-03
- **Severity:** Critical
- **Component:** Production D1 database (`walletwise-db`)
- **Status:** Resolved

---

## 1. Symptoms & Error Messages

The deployed app allowed account creation and sign-in, but account reads and
writes, transaction writes, and import commits returned HTTP 500. Spreadsheet
parsing and import preview returned HTTP 200.

## 2. Root Cause Analysis

`npx wrangler d1 migrations list walletwise-db --remote` showed
`0002_complex_miracleman.sql` as unapplied. The deployed API expected
`accounts.opening_balance` and `transactions.account_id`, while production D1
still had the earlier `accounts.balance` column and no transaction account link.

## 3. Resolution & Code Changes

Applied the existing migration to the configured production database. It
renames `accounts.balance` to `accounts.opening_balance` and adds the nullable
`transactions.account_id` foreign key; no existing balance data was discarded.
The import preview was updated to return validated new rows so users can inspect
transaction and budget details before confirming. Account and transaction
forms now remain open after save failures, with guidance to check for a saved
record before retrying. Import failures provide the same safe retry guidance.

## 4. Verification

- Remote Wrangler migration list reports no pending migrations.
- Deployed browser test created an account, linked and saved a transaction,
  imported a linked transaction, and verified the calculated account balance.
- The synthetic account and transactions used for verification were deleted.
- `npm run build` validates the follow-up API/UI changes.

## 5. Prevention Strategy

Apply and verify remote D1 migrations before browser smoke tests or deployment
acceptance. Include `wrangler d1 migrations list <database> --remote` in the
release checklist and exercise account, transaction, and import writes after
schema changes.