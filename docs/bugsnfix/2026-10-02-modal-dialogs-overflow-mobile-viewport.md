# BUG-010: Modal Dialogs Overflow the Viewport — Submit Button Unreachable on Mobile

- **Date:** 2026-10-02
- **Severity:** High (core "record a transaction" flow is impossible on a phone)
- **Component:** `TransactionsView`, `AccountsView`, `BudgetsView`, `SettingsView`
- **Status:** ✅ Resolved
- **Found by:** Playwright E2E suite, `mobile` project only (`e2e/app.spec.ts` — "creates and then deletes a transaction")

---

## 1. Symptoms & Error Messages

On a Pixel 5 viewport (393×851) the **Record Transaction** dialog opens with all
fields visible, but pressing **Record Transaction** does nothing — the dialog
stays open, the form keeps its values, and no record is created.

The Playwright failure was a test-timeout on the submit click, with this page
snapshot: the dialog still mounted, `Amount` = `42.50`, `Description` =
`PW Groceries …`, category selected, and the list behind still reading
"No transactions found".

The same run's **account** dialog worked, because that form is short enough to
fit. Only the transaction dialog — the tallest form in the app — failed.

---

## 2. Root Cause Analysis

The dialog shell is a centred flex overlay with a card that has **no height cap
and no overflow handling**:

```jsx
// BEFORE — src/components/transactions/TransactionsView.tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
  <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl border border-hairline">
```

`max-w-md` constrains width only. On a phone the transaction form (Amount, Date,
Category, Description, Recurring, Notes, Receipt, then the button row) is taller
than the viewport, so the card grows past the bottom edge. Neither the overlay
nor the card can scroll — `items-center` centres the overflow, clipping equal
amounts off the top *and* bottom — so the submit button is **physically
unreachable**. There is no gesture that reveals it.

`ImportReviewModal.tsx` already used the correct pattern
(`max-h-[85vh] flex flex-col`), which is why only the other four dialogs were
affected.

This directly violates `AGENT.md` §3.3, which mandates a mobile-first layout.

---

## 3. Resolution & Code Changes

Every dialog card now caps its height and scrolls internally. `max-h-[90vh]`
leaves a little breathing room under the overlay's own padding, and
`overflow-y-auto` makes the card the scroll container so the sticky backdrop
stays put.

Applied to:

| File | Dialog |
| --- | --- |
| `src/components/transactions/TransactionsView.tsx` | Add / Edit Transaction |
| `src/components/accounts/AccountsView.tsx` | Add / Edit Account |
| `src/components/budgets/BudgetsView.tsx` | Add / Edit Budget |
| `src/components/settings/SettingsView.tsx` | Add / Edit Category |

```diff
- <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl border border-hairline">
+ <div className="bg-surface rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-hairline">
```

Only Tailwind structural utilities were added — no new colours, so the design
token rules in `AGENT.md` §3.1 are untouched.

---

## 4. Verification

| Check | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npm run build` | clean |
| `e2e/app.spec.ts` → "creates and then deletes a transaction" on `mobile` | **fails before, passes after** |
| Full suite, `desktop` + `mobile` | 52/52 passing |

## 5. Prevention Strategy

- The `mobile` Playwright project exists precisely for this class of defect and
  must stay in CI — the desktop project passes this spec happily.
- Any new dialog should copy the `max-h-[90vh] overflow-y-auto` pattern rather
  than inventing its own shell.
- Worth a follow-up review (not a bug, a design question): the row action
  buttons in the list views are `opacity-0 group-hover:opacity-100`. A touch
  device cannot trigger `:hover`, so edit/delete are hard to reach on a phone.
  Making them always visible below the `sm` breakpoint would resolve it.
