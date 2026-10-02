# BUG-002: Toast Component Prop Mismatch and Conflicting Auto-Dismiss Timers

- **Date:** 2026-10-02
- **Severity:** Medium
- **Component:** `src/components/ui/Toast.tsx`, `src/context/FinanceContext.tsx`
- **Status:** Resolved

---

## 1. Symptoms & Error Messages

1. **Empty subtitle rendering:** Toast notifications displayed a blank subtitle line. The parent `ToastContainer` passed `message={toast.description ?? ''}`, but the `ToastMessage` interface defined `description?: string`. The inner `Toast` component expected `message: string`, causing a contract mismatch that produced empty or incorrect toast body text.
2. **Race condition on auto-dismiss:** Two timers fought over the same toast removal:
   - `FinanceContext.addToast` scheduled `setTimeout(() => removeToast(id), 4000)`.
   - `Toast` component scheduled its own `useEffect(() => setTimeout(() => onRemove(id), 5000))` with a 5000ms timeout.
   The result was unpredictable removal timing; some toasts persisted past 4 seconds, while others were removed twice (second removal was harmless but revealed conflicting intent).

No runtime error was thrown, but the UX defect was visible in every toast shown.

---

## 2. Root Cause Analysis

1. **Prop naming divergence:** During a prior refactor the toast payload interface was renamed from `message` to `description` in the context type (`ToastMessage`), but the `ToastContainer` and `Toast` component were not updated to match. The mismatch broke the subtitle rendering path.
2. **Dual timer ownership:** Both the context (source of truth for toast queue) and the presentational component owned removal logic with different durations. This violated single-responsibility for dismissal and created a race.

---

## 3. Resolution & Code Changes

### `src/components/ui/Toast.tsx`

- Removed the `useEffect` import and the 5000ms timer block from `Toast`.
- Renamed `message` prop → `description` in both `ToastProps` and `Toast` component.
- Updated `ToastContainer` mapping to pass `description={toast.description}` instead of `message={toast.description ?? ''}`.
- Updated the subtitle `<p>` to render `{description}` instead of `{message}`.

Result: `Toast` is now purely presentational. The context owns creation and dismissal timing.

### `src/context/FinanceContext.tsx`

- No code change required here; the existing `setTimeout(() => removeToast(id), 4000)` in `addToast` is now the single dismissal authority.

---

## 4. Verification

1. `npm run lint` completed with no new errors from these changes.
2. `npx tsc --noEmit` passed.
3. Manual smoke test: trigger toast via `addToast(...)` from any CRUD action; confirm subtitle text renders and toast disappears after ~4 seconds.

---

## 5. Prevention Strategy

- Enforce prop-name alignment between context interfaces and presentational components via TypeScript strict checks; do not allow `?? ''` fallbacks that hide mismatched interface fields.
- Keep timer logic in one layer only. If dismissal timing needs to change, update it in the context and document the contract in `ToastMessage`.
