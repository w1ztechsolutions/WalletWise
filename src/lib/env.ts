/**
 * Client-side runtime environment marker.
 *
 * `__WW_ENVIRONMENT__` is injected by `vite.config.ts` (`define`) and mirrors
 * the `ENVIRONMENT` binding the Workers runtime reads in
 * `functions/lib/errors.ts`. Keeping one name on both sides means a single
 * grep tells you every place verbosity is decided.
 *
 * The rule is identical to the server and fails closed: only `"development"`
 * is development. A misconfigured build reports production and therefore stays
 * sanitized (SECURITY.md §7).
 */
declare const __WW_ENVIRONMENT__: "development" | "production";

/** Resolved runtime marker for the browser bundle. */
export const ENVIRONMENT: "development" | "production" =
  typeof __WW_ENVIRONMENT__ === "undefined" ? "production" : __WW_ENVIRONMENT__;

/** True only for a development build (`vite dev`, not `vite build`). */
export const IS_DEV: boolean = ENVIRONMENT === "development";

/**
 * Writes a diagnostic to the console.
 *
 * No-op in production so verbose failures never reach a user's devtools or a
 * shared screen recording; `console.debug` is already stripped by most build
 * pipelines, but the explicit guard makes the intent obvious at the call site.
 */
export function devLog(...args: unknown[]): void {
  if (IS_DEV) {
    console.error(...args);
  }
}