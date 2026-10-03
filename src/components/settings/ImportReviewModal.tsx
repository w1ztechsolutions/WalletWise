import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/useUser";
import type {
  ImportPreview,
  ImportDuplicate,
  ImportTransactionRow,
  ImportBudgetRow,
  DuplicateDecision,
} from "@/hooks/useBulkImport";

interface ImportReviewModalProps {
  preview: ImportPreview;
  accountNames: Record<string, string>;
  isCommitting: boolean;
  onCancel: () => void;
  onConfirm: (decisions: Record<string, DuplicateDecision>) => void;
}

/**
 * Review step for the spreadsheet import.
 *
 * Nothing is written before this screen is confirmed — `?mode=preview` only
 * classifies. Each duplicate is shown side-by-side with its existing D1 row and
 * resolved explicitly as Skip or Replace, so re-importing a statement never
 * silently doubles a transaction.
 */
export const ImportReviewModal: React.FC<ImportReviewModalProps> = ({
  preview,
  accountNames,
  isCommitting,
  onCancel,
  onConfirm,
}) => {
  const currency = useCurrency();
  // Default is Skip: importing is additive, and the safe answer to "this already
  // exists" is to leave the stored row untouched.
  const [decisions, setDecisions] = useState<Record<string, DuplicateDecision>>({});

  const duplicates = useMemo(
    () => [...preview.duplicates.transactions, ...preview.duplicates.budgets],
    [preview]
  );
  const readyCount = preview.newRows.transactions.length + preview.newRows.budgets.length;

  const decisionFor = (key: string): DuplicateDecision => decisions[key] ?? "skip";

  const setDecision = (key: string, decision: DuplicateDecision) => {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
  };

  const replaceCount = duplicates.filter((d) => decisionFor(d.key) === "replace").length;
  const skipCount = duplicates.length - replaceCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-surface rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-hairline">
        <div className="flex items-start justify-between pb-4 border-b border-hairline shrink-0">
          <div>
            <h3 className="text-base font-bold text-platinum">Review Import</h3>
            <p className="text-xs text-muted mt-0.5">
              {preview.inserted.transactions + preview.inserted.budgets} new · {duplicates.length}{" "}
              duplicate{duplicates.length === 1 ? "" : "s"} · {preview.invalid.length} invalid
            </p>
          </div>
          <button onClick={onCancel} disabled={isCommitting} className="text-muted hover:text-platinum p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {preview.invalid.length > 0 && (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/40">
              <p className="text-xs font-semibold text-platinum flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                {preview.invalid.length} row{preview.invalid.length === 1 ? "" : "s"} will be skipped
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {preview.invalid.slice(0, 5).map((row, idx) => (
                  <li key={idx} className="text-[11px] text-muted">
                    {row.entity}: {row.reason}
                  </li>
                ))}
                {preview.invalid.length > 5 && (
                  <li className="text-[11px] text-muted">…and {preview.invalid.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {readyCount > 0 && (
            <section className="space-y-2" aria-label="Rows ready to import">
              <h4 className="text-xs font-semibold text-platinum">Ready to import ({readyCount})</h4>
              <ul className="divide-y divide-hairline rounded-lg border border-hairline">
                {preview.newRows.transactions.map((row, index) => (
                  <li key={`transaction-${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-platinum truncate">
                        {row.description || row.category_name}
                      </p>
                      <p className="text-[11px] text-muted">
                        {row.date} · {row.type} · {row.category_name} · {accountLabel(row.account_id, accountNames)}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-platinum">
                      {formatCurrency(row.amount, currency)}
                    </p>
                  </li>
                ))}
                {preview.newRows.budgets.map((row, index) => (
                  <li key={`budget-${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-platinum truncate">{row.category_name} budget</p>
                      <p className="text-[11px] text-muted">{row.month} · Budget</p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-platinum">
                      {formatCurrency(row.planned_amount, currency)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {duplicates.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">
              No duplicates found — every row is new.
            </p>
          ) : (
            duplicates.map((dup) => {
              const isTransaction = "date" in dup.incoming;
              return (
                <DuplicateRow
                  key={dup.key}
                  duplicate={dup as ImportDuplicate<ImportTransactionRow & ImportBudgetRow>}
                  isTransaction={isTransaction}
                  decision={decisionFor(dup.key)}
                  accountNames={accountNames}
                  onChange={(next) => setDecision(dup.key, next)}
                  disabled={isCommitting}
                />
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-hairline shrink-0">
          <p className="text-[11px] text-muted">
            {skipCount} skipped · {replaceCount} replaced
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isCommitting}
              className="px-4 py-2 text-xs font-medium text-muted hover:bg-surface-3 rounded-xl disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(decisions)}
              disabled={isCommitting}
              className="px-5 py-2 text-xs font-semibold bg-gold hover:bg-gold-hover text-ink shadow-gold rounded-xl disabled:opacity-60 disabled:cursor-wait"
            >
              {isCommitting ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DuplicateRowProps {
  duplicate: ImportDuplicate<ImportTransactionRow & ImportBudgetRow>;
  isTransaction: boolean;
  decision: DuplicateDecision;
  accountNames: Record<string, string>;
  onChange: (decision: DuplicateDecision) => void;
  disabled: boolean;
}

const DuplicateRow: React.FC<DuplicateRowProps> = ({
  duplicate,
  isTransaction,
  decision,
  accountNames,
  onChange,
  disabled,
}) => {
  const { incoming, existing } = duplicate;
  const currency = useCurrency();

  return (
    <div className="rounded-xl border border-hairline overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-platinum">
          {isTransaction ? (incoming.description || incoming.category_name) : incoming.category_name}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange("skip")}
            disabled={disabled}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
              decision === "skip" ? "bg-surface-3 text-platinum" : "text-muted hover:bg-surface-3"
            }`}
          >
            {decision === "skip" && <Check className="w-3 h-3" />}
            Skip
          </button>
          <button
            type="button"
            onClick={() => onChange("replace")}
            disabled={disabled}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
              decision === "replace" ? "bg-indigo/20 text-platinum" : "text-muted hover:bg-surface-3"
            }`}
          >
            {decision === "replace" ? <Check className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
            Replace
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-hairline text-[11px]">
        <div className="p-3 space-y-0.5">
          <p className="text-muted font-semibold uppercase tracking-wide text-[10px]">Existing</p>
          <p className="text-platinum">
            {String(existing.date ?? existing.month ?? "—")}
            {isTransaction ? ` · ${existing.type ?? ""}` : ""}
          </p>
          <p className="text-platinum">
            {formatCurrency(Number(existing.amount ?? existing.planned_amount ?? 0), currency)}
          </p>
          <p className="text-muted truncate">{String(existing.description ?? existing.notes ?? "")}</p>
          {isTransaction && (
            <p className="text-muted truncate">Account: {accountLabel(existing.account_id, accountNames)}</p>
          )}
        </div>
        <div className="p-3 space-y-0.5">
          <p className="text-muted font-semibold uppercase tracking-wide text-[10px]">Incoming</p>
          <p className="text-platinum">
            {incoming.date ?? incoming.month}
            {incoming.type ? ` · ${incoming.type}` : ""}
          </p>
          <p className="text-platinum">
            {formatCurrency(incoming.amount ?? incoming.planned_amount, currency)}
          </p>
          <p className="text-muted truncate">{incoming.description || incoming.notes || ""}</p>
          {isTransaction && (
            <p className="text-muted truncate">Account: {accountLabel(incoming.account_id, accountNames)}</p>
          )}
        </div>
      </div>
    </div>
  );
};

function accountLabel(accountId: unknown, accountNames: Record<string, string>): string {
  if (typeof accountId !== "string" || !accountId) return "Unlinked";
  return accountNames[accountId] ?? "Unavailable account";
}