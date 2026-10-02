import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export const sessionKeys = {
  all: ["session"] as const,
  current: () => [...sessionKeys.all, "current"] as const,
};

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null | undefined;
}

export interface WalletWiseSession {
  user: SessionUser;
  session: { id: string; userId: string; expiresAt: string | Date };
}

export interface UseSessionResult {
  /** Authenticated user, or `null` while anonymous / still resolving. */
  user: SessionUser | null;
  session: WalletWiseSession | null;
  /** True only while the very first session check is in flight. */
  isLoading: boolean;
  isFetching: boolean;
  isAuthenticated: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Resolves the Better Auth session into three distinct states — loading,
 * authenticated, anonymous. The distinction matters: rendering the auth screen
 * during the initial check would flash a login form at already-signed-in users.
 *
 * `retry: false` is essential. Every data hook mounted behind the gate would
 * otherwise retry a 401 several times before the session resolved, producing a
 * request storm on every cold load.
 */
export function useSession(): UseSessionResult {
  const query = useQuery({
    queryKey: sessionKeys.current(),
    queryFn: async (): Promise<WalletWiseSession | null> => {
      const res = await authClient.getSession();
      return (res?.data as WalletWiseSession | null | undefined) ?? null;
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const session = query.data ?? null;

  return {
    user: session?.user ?? null,
    session,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isAuthenticated: Boolean(session?.user),
    refetch: query.refetch as () => Promise<unknown>,
  };
}