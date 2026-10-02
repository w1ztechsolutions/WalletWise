/**
 * Ambient type for the Cloudflare Workers AI binding (`env.AI`).
 *
 * `@cloudflare/workers-types` does not ship a stable `Ai` interface in this
 * version, so WalletWise declares a minimal global one covering `env.AI.run`
 * (used by the Phase 6.6 spreadsheet parser and the CRUD endpoint `Env`
 * declarations). Declaration merging applies automatically because this file
 * is a plain ambient declaration file included in every TypeScript project
 * (`tsconfig.app.json` covers `src` + `functions`).
 */
interface Ai {
  run(
    model: string,
    input: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<unknown>
}
