import { defineConfig, devices } from '@playwright/test';

/**
 * WalletWise end-to-end configuration.
 *
 * The suite targets the **deployed Cloudflare Pages site** by default, because
 * that is where the real D1/R2/Workers-AI bindings and the edge middleware live —
 * `vite preview` alone would only exercise the static bundle. Point it anywhere
 * else with `E2E_BASE_URL` (e.g. `http://127.0.0.1:8788` for `wrangler pages dev`):
 *
 *   E2E_BASE_URL=http://127.0.0.1:8788 npm run test:e2e
 *
 * ## Two projects, on purpose
 *
 * `AGENT.md` §3.3 makes the navigation shell a hard requirement: a fixed 6-item
 * bottom bar below the `sm` breakpoint, and a slide-in drawer above it. That is
 * two different `src/components/layout/*` components rendering from the same
 * `NavTab` state, so it has to be asserted at both widths or the mobile-first
 * contract is effectively untested.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://walletwise-15b.pages.dev';

/**
 * Data-mutating specs (accounts, transactions, budgets, categories) are skipped
 * unless a credential pair is supplied, because they write real rows into the
 * real D1 database behind this deployment. Read-only specs (smoke, routing,
 * auth-gating, session lifecycle of a throwaway account) run unconditionally.
 *
 *   E2E_EMAIL=...  E2E_PASSWORD=...  npm run test:e2e
 */
const HAS_CREDENTIALS = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false, // shared signed-in account; serial keeps D1 writes deterministic
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video is intentionally off. Encoding a clip per test pushed context
    // teardown past the 60s test timeout against this remote deployment, which
    // failed otherwise-passing specs with "Tearing down context exceeded the
    // test timeout". Traces already replay the full timeline, including video
    // frames, when a failure actually needs investigating.
    video: 'off',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  metadata: {
    hasCredentials: HAS_CREDENTIALS,
  },
});
