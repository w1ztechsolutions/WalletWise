# ADR-005: Account-Linked Transaction Ledger

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** WalletWise maintainers

---

## 1. Context

WalletWise transactions were independent of user-created cash, bank, and mobile-wallet accounts. Accounts stored a manually edited `balance`, so create, edit, delete, and import-replacement flows had no consistent way to adjust a balance exactly once. Existing transactions and spreadsheet imports also need to remain valid without an account assignment.

## 2. Decision

Add nullable `transactions.account_id` referencing `accounts.id`. Deleting an account sets this reference to `NULL`, preserving the transaction. Every API write that supplies an account ID verifies that the account belongs to the authenticated user.

Rename the stored account balance to `opening_balance`. Return the current account balance as a calculation:

`opening_balance + linked income - linked expenses`

Unlinked transactions do not affect an account. The existing stored balance is preserved by the migration as the opening balance; users linking historical transactions must set that opening balance to the amount immediately before the earliest linked transaction.

Manual transaction entry and editing offer an optional account selector. Spreadsheet imports accept an optional account name, resolve it case-insensitively only when it uniquely matches an existing account, and leave missing, unknown, or ambiguous names unlinked. The import API independently validates all submitted account IDs.

## 3. Consequences

**Benefits**

- Edits, reassignment, deletion, and duplicate replacement cannot double-apply balance deltas because balances are derived from the ledger.
- Existing transactions and old spreadsheets remain compatible and unlinked by default.
- Deleting an account preserves transactions and clears only their account link.
- Account ownership is checked at the server boundary, not trusted from client-side matching.

**Trade-offs**

- Account reads aggregate linked transaction history, so the query cost grows with ledger size.
- Historical linking requires the user to choose the correct opening balance; retaining the old displayed balance while adding older transactions would overstate the account.
- Account-name matching cannot infer user intent when names are missing or duplicated; those transactions require manual linking.
