import { createAuthClient } from "better-auth/react";

/**
 * Better Auth **client** used by the Vite frontend bundle.
 *
 * This module must never import `@/lib/auth` (the server factory in
 * `src/lib/auth.ts`) — that file pulls `drizzle-orm/d1` and `src/db/schema.ts`
 * into the graph, which cannot be bundled for the browser. Keeping the two
 * sides apart is what makes the client/server boundary explicit.
 *
 * `baseURL` must be absolute: the client rejects a relative path ("Invalid base
 * URL"), so it is resolved against the current origin. Requests stay same-origin
 * either way, and the session cookie (`walletwise_session`, httpOnly) is invisible
 * to JS and travels automatically via `credentials: "include"`.
 */
const AUTH_BASE_URL = `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
});

export const { signIn, signUp, signOut } = authClient;