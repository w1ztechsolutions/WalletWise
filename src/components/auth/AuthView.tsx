import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Lock, Mail, User as UserIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { sessionKeys } from "@/hooks/useSession";

type AuthMode = "sign-in" | "sign-up";

const COPY: Record<AuthMode, { title: string; subtitle: string; cta: string; switchTo: AuthMode; switchLabel: string }> = {
  "sign-in": {
    title: "Welcome back",
    subtitle: "Sign in to reach your wallets, budgets and analytics.",
    cta: "Sign In",
    switchTo: "sign-up",
    switchLabel: "Need an account? Create one",
  },
  "sign-up": {
    title: "Create your account",
    subtitle: "Start tracking income, spending and budgets in D1.",
    cta: "Create Account",
    switchTo: "sign-in",
    switchLabel: "Already registered? Sign in",
  },
};

/**
 * Full-screen authentication surface shown whenever there is no session.
 *
 * Signed-out users must still be able to see form errors, which is why this
 * lives outside `AppContent` in `App.tsx` — the toast container above it
 * stays mounted regardless of auth state.
 */
export const AuthView: React.FC = () => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isSignUp = mode === "sign-up";

  /** Better Auth surfaces the most specific validation problem; keep it visible. */
  const describeError = (err: unknown): string => {
    if (err && typeof err === "object" && "message" in err) {
      const message = String((err as { message: unknown }).message);
      if (message) return message;
    }
    return "Something went wrong. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password are both required.");
      return;
    }
    if (isSignUp && !name.trim()) {
      setError("Enter your name to create an account.");
      return;
    }
    if (isSignUp && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsPending(true);
    try {
      // Better Auth's client **resolves** with `{ data, error }` on a failed
      // request instead of rejecting, so a `catch`-only handler never fires and
      // every credential failure would look like a no-op click. Each result is
      // therefore checked and its error promoted to a throw, keeping this
      // `catch` the single place that turns a failure into visible text.
      if (isSignUp) {
        const res = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (res.error) throw res.error;
      } else {
        const res = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (res.error) throw res.error;
      }
      // The session cookie now exists, but `useSession` is a plain React Query
      // read — it has no subscription to the auth client, so it must be
      // invalidated explicitly for `AuthGate` to swap in the app.
      await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsPending(false);
    }
  };

  const switchMode = () => {
    setError(null);
    setMode(isSignUp ? "sign-in" : "sign-up");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 font-sans"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/logo_title_bar.png"
            alt=""
            className="w-28 h-28 object-contain"
          />
          <h1 className="text-xl font-bold brand-title mt-2">WalletWise</h1>
          <p className="text-[11px] font-semibold uppercase text-muted mt-1">
            Personal Finance Tracker
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 shadow-card"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold">{COPY[mode].title}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {COPY[mode].subtitle}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5 mt-5" noValidate>
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Full name
                </label>
                <div className="relative">
                  <UserIcon
                    className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-secondary)" }}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: "var(--bg-surface-3)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Email
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-secondary)" }}
                  aria-hidden="true"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: "var(--bg-surface-3)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-secondary)" }}
                  aria-hidden="true"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: "var(--bg-surface-3)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded-xl text-xs"
                style={{
                  backgroundColor: "var(--danger-subtle)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-wait"
              style={{
                background: "linear-gradient(135deg, #D97706, #B45309)",
                color: "#000",
              }}
            >
              {isPending ? "Please wait…" : COPY[mode].cta}
            </button>
          </form>

          <button
            type="button"
            onClick={switchMode}
            disabled={isPending}
            className="w-full mt-4 text-xs font-bold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ color: "var(--accent-gold)" }}
          >
            {COPY[mode].switchLabel}
          </button>
        </div>
      </div>
    </div>
  );
};