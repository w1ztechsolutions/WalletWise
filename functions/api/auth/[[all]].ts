import { createAuth } from "../../../src/lib/auth";
import type { Env } from "../../../src/types/env";

/**
 * Better Auth catch-all route: handles `/api/auth/*`
 * (sign-up, sign-in, sign-out, get-session, callbacks, ...).
 *
 * Note: Pages Functions catch-all segments are declared as `[[name]].ts`
 * (wrangler only accepts alphanumeric/underscore parameter names — bracket
 * dots like `[[...all]]` are rejected at build time).
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const auth = createAuth(context.env.DB);
  return auth.handler(context.request);
};
