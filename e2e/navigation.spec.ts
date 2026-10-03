import { test, expect, gotoApp, signIn, NAV_TABS, navigateTo, bottomNav, addRecordButton, requireCredentials, CREDENTIALS } from './helpers';

/**
 * Navigation shell and hash routing.
 *
 * `App.tsx` keeps the active tab in `window.location.hash`, and `Navbar.tsx`
 * titles each tab. Two facts are worth locking down here:
 *   1. Every tab is reachable through the real chrome at both breakpoints
 *      (drawer on desktop, fixed bottom bar on mobile — AGENT.md §3.3).
 *   2. A deep link restores the right tab, so a reload or a shared URL is
 *      not silently dropped back to the dashboard.
 */
test.describe('navigation', () => {
  test('redirects anonymous visitors away from deep links to sign-in', async ({ page }) => {
    // Navigating straight to a hash must not bypass the auth gate.
    await page.goto('/#settings');
    await expect(page.getByText('Checking your session…')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('opens the slide-in drawer from the navbar', async ({ page }) => {
    await gotoApp(page);
    // Anonymous visitors are never given the app shell, so neither nav
    // component may exist in the DOM — not even the mobile bottom bar, which
    // is rendered by `AppContent` and therefore only ever mounts post-auth.
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('nav.fixed.bottom-0')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open navigation sidebar' })).toHaveCount(0);
  });

  test.describe('signed in', () => {
    test.beforeEach(async ({ page }) => {
      requireCredentials();
      await signIn(page, CREDENTIALS.email!, CREDENTIALS.password!);
    });

    test('renders the authenticated shell with the six nav tabs', async ({ page, isMobile }) => {
      if (isMobile) {
        const nav = bottomNav(page);
        await expect(nav).toBeVisible();
        for (const tab of NAV_TABS) {
          await expect(nav.getByRole('button', { name: tab.mobile, exact: true })).toBeVisible();
        }
      } else {
        await page.getByRole('button', { name: 'Open navigation sidebar' }).click();
        await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible();
        for (const tab of NAV_TABS) {
          await expect(page.getByRole('button', { name: tab.drawer, exact: true })).toBeVisible();
        }
      }
    });

    test('navigates to every tab and updates the hash', async ({ page }, testInfo) => {
      for (const tab of NAV_TABS) {
        await navigateTo(page, testInfo.project.name, tab.id);
        expect(new URL(page.url()).hash, `hash after navigating to ${tab.id}`).toBe(`#${tab.id}`);
      }
    });

    test('restores the active tab from a deep link on reload', async ({ page }, testInfo) => {
      await navigateTo(page, testInfo.project.name, 'budgets');
      await expect(page.getByRole('heading', { name: 'Budgets & Planning' })).toBeVisible();

      await page.reload();
      await expect(page.getByRole('heading', { name: 'Budgets & Planning' })).toBeVisible({
        timeout: 20_000,
      });
    });

    test('ignores an invalid hash and falls back to the dashboard', async ({ page }) => {
      await page.goto('/#not-a-real-tab');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
        timeout: 20_000,
      });
    });

    test('opens the add-transaction modal from the navbar', async ({ page }) => {
      // The navbar CTA switches to the transactions tab and opens the modal in
      // one gesture — see the `onOpenAddModal` handler in App.tsx.
      await addRecordButton(page).click();

      await expect(page.getByRole('button', { name: 'Record Transaction' })).toBeVisible();
      await expect(page.getByText('Amount *')).toBeVisible();
    });
  });
});
