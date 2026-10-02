/**
 * Cloudflare Pages Functions environment bindings.
 *
 * Lives under `src/types/` so it can be imported by both the Vite client build
 * and the Pages Functions bundle (via the `@/` alias resolved from the root
 * and `functions/` tsconfig files).
 */

/**
 * Minimal typing for the Workers AI binding (`env.AI`).
 * The ambient global `Ai` interface is declared in `src/types/globals.d.ts`.
 */

export interface Env {
  /** Better Auth + Drizzle D1 database binding. */
  DB: D1Database
  /** Cloudflare R2 bucket binding (receipts / spreadsheet archives). */
  STORAGE: R2Bucket
  /** Cloudflare Workers AI binding (spreadsheet parsing). */
  AI: Ai
  /** Cloudflare Pages static asset binding (provided by the Pages runtime). */
  ASSETS?: Fetcher
  /** R2 presigning configuration (secrets, see `.dev.vars.example`). */
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  /** Plain (non-secret) variable defined in `wrangler.jsonc`. */
  R2_BUCKET_NAME?: string
}

