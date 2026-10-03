import React, { useEffect, useState } from "react";
import { LogOut, RotateCcw, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useBudgets } from "@/hooks/useBudgets";
import { useCurrency, useUser } from "@/hooks/useUser";
import { useRestoreAccount } from "@/hooks/useAccountDeletion";
import { sessionKeys } from "@/hooks/useSession";
import { authClient } from "@/lib/auth-client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useFinance } from "@/context/FinanceContext";

export const AccountRecoveryView: React.FC = () => {
  const { addToast } = useFinance();
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  const { data: accounts = [] } = useAccounts();
  const { data: transactions = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();
  const currency = useCurrency();
  const { mutate: restoreAccount, isPending: isRestoring } = useRestoreAccount();
  const deletionDate = user?.deletionScheduledFor ? new Date(user.deletionScheduledFor) : null;
  const [canRestore, setCanRestore] = useState(false);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  useEffect(() => {
    const refreshRestoreWindow = () => {
      setCanRestore(Boolean(user?.deletionScheduledFor && Date.parse(user.deletionScheduledFor) > Date.now()));
    };
    refreshRestoreWindow();
    const timer = window.setInterval(refreshRestoreWindow, 60_000);
    return () => window.clearInterval(timer);
  }, [user?.deletionScheduledFor]);

  const handleSignOut = async () => {
    const response = await authClient.signOut();
    if (response.error) {
      addToast("Sign out failed", response.error.message ?? "Please try again.", "error");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
  };

  const handleRestore = () => {
    restoreAccount(undefined, {
      onSuccess: () => addToast("Account restored", "Your account and editing access are active again.", "success"),
      onError: (error: unknown) =>
        addToast("Unable to restore account", error instanceof Error ? error.message : "Please try again.", "error"),
    });
  };

  return (
    <main className="min-h-screen bg-ink text-platinum px-4 py-8 sm:px-8">
      <div className="max-w-4xl mx-auto space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-6">
          <div className="flex gap-3">
            <ShieldAlert className="w-6 h-6 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-bold">Account deletion scheduled</h1>
              <p className="text-sm text-muted mt-1">
                Your data is read-only. Restore your account to make changes.
              </p>
              <p className="text-xs text-muted mt-3">
                {deletionDate && canRestore
                  ? `Restore before ${deletionDate.toLocaleString()}. Data will be permanently deleted after that time.`
                  : "The recovery period has ended. Permanent deletion is being processed."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canRestore && (
              <button
                type="button"
                onClick={handleRestore}
                disabled={isRestoring}
                className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                {isRestoring ? "Restoring…" : "Restore account"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-sm text-muted hover:text-platinum"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>

        <section aria-label="Account data preview" className="space-y-4">
          <h2 className="text-base font-semibold">Account preview</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PreviewMetric label="Name" value={user?.name ?? "—"} />
            <PreviewMetric label="Email" value={user?.email ?? "—"} />
            <PreviewMetric label="Financial accounts" value={String(accounts.length)} />
            <PreviewMetric label="Transactions" value={String(transactions.length)} />
            <PreviewMetric label="Budgets" value={String(budgets.length)} />
            <PreviewMetric
              label="Current balances"
              value={formatCurrency(accounts.reduce((total, account) => total + account.balance, 0), currency)}
            />
          </div>
        </section>

        <section aria-label="Financial account preview" className="space-y-3">
          <h2 className="text-base font-semibold">Financial accounts</h2>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">No financial accounts.</p>
          ) : (
            <div className="divide-y divide-hairline border-y border-hairline">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{account.name}</p>
                    <p className="text-xs text-muted capitalize">{account.type} · {account.institution || "No provider"}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatCurrency(account.balance, currency)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Recent transaction preview" className="space-y-3">
          <h2 className="text-base font-semibold">Recent transactions</h2>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted">No transactions.</p>
          ) : (
            <div className="divide-y divide-hairline border-y border-hairline">
              {transactions.slice(0, 10).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{transaction.description || transaction.category_name}</p>
                    <p className="text-xs text-muted">
                      {formatDate(transaction.date)} · {transaction.category_name}
                      {transaction.account_id ? ` · ${accountNames.get(transaction.account_id) ?? "Account"}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {transaction.type === "income" ? "+" : "−"}{formatCurrency(transaction.amount, currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

const PreviewMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-t border-hairline py-3 min-w-0">
    <p className="text-[11px] text-muted">{label}</p>
    <p className="text-sm font-semibold truncate mt-1" title={value}>{value}</p>
  </div>
);