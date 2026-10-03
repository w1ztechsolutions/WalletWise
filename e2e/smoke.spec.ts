import { test, expect, gotoApp, trackRuntimeErrors } from './helpers';

/**
 * Deployment smoke tests.
 *
 * These are the cheapest possible signal that the published Pages site is
 * healthy: the shell boots, the bundle is actually served (not a stale 404
 * index), and the edge middleware rejects anonymous API traffic. They run
 * without credentials and without touching D1.
 */
test.describe('deployment smoke', () => {
  test('serves the app shell with the correct document metadata', async ({ page }) => {
    const errors = trackRuntimeErrors(page);
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/WalletWise/);

    // The SPA entry point must actually mount the React root.
    await expect(page.locator('#root')).toBeAttached();
    await expect(page.getByRole('heading', { name: 'WalletWise' }).first()).toBeVisible();

    expect(errors, `runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('loads the JS and CSS bundles without 404s', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/assets/')) {
        failed.push(`${res.status()} ${res.url()}`);
      }
    });

    await gotoApp(page);
    // The auth screen proves React hydrated from the module bundle.
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(failed, `failed asset requests: ${failed.join(' | ')}`).toEqual([]);
  });

  test('renders the sign-in form for anonymous visitors', async ({ page }) => {
    await gotoApp(page);

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Sign in to reach your wallets')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();

    // The full name field only exists in sign-up mode.
    await expect(page.getByPlaceholder('Ada Lovelace')).toHaveCount(0);
  });

  test('rejects anonymous /api/* requests with the documented 401 envelope', async ({ request }) => {
    // `functions/_middleware.ts` gates everything except /api/auth/*, and
    // `docs/api/README.md` fixes the body shape. Regression here would mean
    // user data is readable without a session (SECURITY.md §2).
    const protectedRoutes = [
      '/api/user/me',
      '/api/accounts',
      '/api/transactions',
      '/api/budgets',
      '/api/categories',
      '/api/analytics?view=overview',
    ];

    for (const route of protectedRoutes) {
      const res = await request.get(route);
      expect(res.status(), `${route} should be 401`).toBe(401);
      const body = await res.json();
      expect(body.code, `${route} error code`).toBe('UNAUTHORIZED');
      expect(body.error).toBe('Unauthorized');
    }
  });

  test('does not leak stack traces in production error responses', async ({ request }) => {
    // `ENVIRONMENT` is "production" on this deployment, so `details` — which
    // can carry a D1 stack trace — must be absent (SECURITY.md §7).
    const res = await request.post('/api/transactions', {
      data: { description: 'unauthenticated write attempt' },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('at ');
  });
});
