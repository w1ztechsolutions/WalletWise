import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthView } from "./AuthView";
import { authClient } from "@/lib/auth-client";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { useSession } from "@/hooks/useSession";

/**
 * Single gate between the anonymous and authenticated worlds.
 *
 * Three states are handled explicitly — resolving, anonymous, authenticated.
 * The gate also owns the "session died mid-session" path: `apiFetch` fires
 * `UNAUTHORIZED_EVENT` on any 401, and reacting here means a revoked or
 * expired cookie drops the user back to the auth screen with an empty query
 * cache instead of leaving every view stuck on an error state.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading, isAuthenticated } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUnauthorized = () => {
      // Clear first: cached rows are scoped to the session that just died and
      // must never be visible to whoever authenticates next.
      queryClient.clear();
      void authClient.signOut();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [queryClient]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center font-sans"
        style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent-gold)", borderTopColor: "transparent" }}
            role="status"
            aria-label="Checking your session"
          />
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Checking your session…
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <AuthView />;

  return <>{children}</>;
};