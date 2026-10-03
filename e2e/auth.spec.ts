import { test, expect, gotoApp, fillSignIn, signIn, signOut, requireCredentials, CREDENTIALS, addRecordButton, trackRuntimeErrors } from './helpers';

/**
 * Authentication lifecycle.
 *
 * `AuthView.tsx` validates on the client before it ever calls Better Auth, so
 * the validation specs below assert that contract precisely. The full sign-in /
 * sign-out round trip needs a real account and therefore real credentials.
 */
test.describe('authentication', () => {
  test('requires both email and password before calling the API', async ({ page }) => {
    await gotoApp(page);

    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Email and password are both required.');
  });

  test('toggles between sign-in and sign-up modes', async ({ page }) => {
    await gotoApp(page);

    // Sign-up adds the full name field and re-labels the CTA.
    await page.getByRole('button', { name: 'Need an account? Create one' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByPlaceholder('Ada Lovelace')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();

    await page.getByRole('button', { name: 'Already registered? Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByPlaceholder('Ada Lovelace')).toHaveCount(0);
  });

  test('enforces the 8-character password minimum on sign-up', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Need an account? Create one' }).click();

    await page.getByPlaceholder('Ada Lovelace').fill('Ada Lovelace');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('••••••••').fill('short');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByRole('alert')).toHaveText('Password must be at least 8 characters.');
  });

  test('requires a name on sign-up', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Need an account? Create one' }).click();

    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('••••••••').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByRole('alert')).toHaveText('Enter your name to create an account.');
  });

  test('rejects bad credentials with a visible error', async ({ page }) => {
    await gotoApp(page);

    // Uses a syntactically valid but non-existent account: the server must
    // refuse, and the UI must surface it in the form's `role="alert"` box.
    await fillSignIn(page, 'nobody@walletwise.invalid', 'definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    // The auth screen must stay mounted — a successful "login" here would be a
    // serious authentication bypass.
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('signs in, restores the session on reload, and signs out', async ({ page }) => {
    requireCredentials();
    const { email, password } = CREDENTIALS;
    const errors = trackRuntimeErrors(page);

    await signIn(page, email!, password!);

    // The drawer proves the session resolved and AppContent mounted.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Label collapses to "Add" below the `sm` breakpoint.
    await expect(addRecordButton(page)).toBeVisible();

    // A reload must not bounce back to the auth screen: the session cookie is
    // httpOnly and has to survive a cold boot of the SPA.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 20_000,
    });

    await signOut(page);
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();

    // After sign-out the session must be gone server-side too, not just hidden
    // client-side — otherwise the next visitor could resume it.
    const probe = await page.request.get('/api/user/me');
    expect(probe.status()).toBe(401);

    expect(errors, `runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
