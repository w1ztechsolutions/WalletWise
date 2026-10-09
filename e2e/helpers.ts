import { test as base, expect, type Page } from '@playwright/test';

/**
 * Credentials for the data-mutating specs.
 *
 * Those specs create real rows in the real D1 database behind this deployment,
 * so they are opt-in: without `E2E_EMAIL` / `E2E_PASSWORD` they skip instead of
 * silently writing to production. Read-only specs never consult these.
 */
export const CREDENTIALS = {
  email: process.env.E2E_EMAIL,
  password: process.env.E2E_PASSWORD,
};

export const HAS_CREDENTIALS = Boolean(CREDENTIALS.email && CREDENTIALS.password);

/**
 * Skips the calling spec unless real credentials were supplied.
 *
 *   test('creates an account', async ({ page }) => {
 *     requireCredentials();
 *     ...
 *   });
 */
export function requireCredentials(): void {
  test.skip(
    !HAS_CREDENTIALS,
    'Set E2E_EMAIL and E2E_PASSWORD to run tests that write to D1.',
  );
}

/** Navigates to `/` and waits for the session check to settle. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  // `AuthGate` shows a "Checking your session…" spinner first; waiting for it to
  // disappear avoids racing the sign-in form into existence.
  await expect(page.getByText('Checking your session…')).toBeHidden();
}

/** Fills the sign-in form. Does not submit. */
export async function fillSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
}

/** Signs in and waits for the authenticated shell (the app navbar) to mount. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await gotoApp(page);
  await fillSignIn(page, email, password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open navigation sidebar' })).toBeVisible({
    timeout: 20_000,
  });
}

/** Signs out through the sidebar drawer. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open navigation sidebar' }).click();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * The six tabs in `src/components/layout/Sidebar.tsx` (drawer) and
 * `BottomNav.tsx` (mobile). The drawer labels are the source of truth; the
 * bottom bar uses shorter labels for the same `NavTab` ids.
 */
export const NAV_TABS = [
  { id: 'dashboard', drawer: 'Dashboard', mobile: 'Home', title: 'Dashboard' },
  { id: 'transactions', drawer: 'Transactions', mobile: 'Records', title: 'Transactions' },
  { id: 'accounts', drawer: 'Accounts', mobile: 'Wallets', title: 'Accounts & Wallets' },
  { id: 'transfers', drawer: 'Transfers', mobile: 'Move', title: 'Transfers' },
  { id: 'budgets', drawer: 'Budgets', mobile: 'Budgets', title: 'Budgets & Planning' },
  { id: 'analytics', drawer: 'Analytics', mobile: 'Charts', title: 'Financial Analytics' },
  { id: 'settings', drawer: 'Settings', mobile: 'Settings', title: 'Settings & Data' },
] as const;

/**
 * The fixed bottom navigation bar.
 *
 * `Sidebar` is always mounted — it is only translated off-screen at mobile
 * widths — so its buttons stay in the accessibility tree. Scoping to this
 * element is what keeps "Budgets"/"Settings" (whose labels are identical in
 * both shells) from tripping Playwright's strict mode.
 */
function bottomNav(page: Page) {
  return page.locator('nav.fixed.bottom-0');
}

/**
 * Drives navigation in whichever shell the active project renders.
 *
 * Clicking through the real chrome is deliberate: a hash-direct `page.goto()`
 * would pass even if both nav components were broken, which is exactly the
 * mobile-first contract `AGENT.md` §3.3 asks us to protect.
 */
export async function navigateTo(page: Page, projectName: string, id: string): Promise<void> {
  const tab = NAV_TABS.find((t) => t.id === id);
  if (!tab) throw new Error(`Unknown tab: ${id}`);

  if (projectName === 'mobile') {
    await bottomNav(page).getByRole('button', { name: tab.mobile, exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Open navigation sidebar' }).click();
    await page.getByRole('button', { name: tab.drawer, exact: true }).click();
  }
  // `.first()` because a view may legitimately repeat the tab's name in its own
  // heading — "Transactions" titles both the navbar and the view body.
  await expect(page.getByRole('heading', { name: tab.title }).first()).toBeVisible();
}

/** The navbar's add-record CTA, whose label collapses to "Add" below `sm`. */
function addRecordButton(page: Page) {
  return page.getByRole('button', { name: /^(Add Record|Add)$/ });
}

/**
 * Fails the test if the page logged an error or threw while it ran.
 *
 * React Query surfaces most failures as a visible error state rather than a
 * console error, so this is a net (not a substitute for the per-view
 * assertions) — it catches the silent ones: bad chunk loads, missing env vars,
 * and hydration-time exceptions.
 */
export function trackRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export const test = base;
export { expect };
export type { Page };
export { bottomNav, addRecordButton };
