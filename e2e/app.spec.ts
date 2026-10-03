import { test, expect, signIn, requireCredentials, CREDENTIALS, trackRuntimeErrors, addRecordButton, type Page } from './helpers';
import { readFile } from 'node:fs/promises';

/**
 * Authenticated data flows — dashboard, accounts, transactions, budgets,
 * categories, analytics.
 *
 * Every spec here reads from and writes to the real D1 database behind this
 * deployment, so the file is gated on `E2E_EMAIL` / `E2E_PASSWORD`. The two
 * create specs clean up after themselves through the UI's own delete
 * affordances so the shared account stays usable for the next run.
 */

/**
 * Loads a tab by hash and waits for its initial D1 read to resolve.
 *
 * Going straight to the hash is correct here: routing is already covered by
 * `navigation.spec.ts`, and this keeps the data specs fast and independent of
 * which shell (drawer vs bottom bar) the active project renders.
 */
async function openView(page: Page, hash: string, loadedText: RegExp): Promise<void> {
  await page.goto(`/#${hash}`);
  await expect(page.getByText(loadedText).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Asserts no `NaN` leaked into the rendered output.
 *
 * Word boundaries are essential: a bare `getByText('NaN')` does a
 * case-insensitive *substring* match and happily matches the "nan" inside
 * "Financial", which every authenticated page has in its navbar title.
 */
async function expectNoNaN(page: Page): Promise<void> {
  await expect(page.getByText(/\bNaN\b/)).toHaveCount(0);
}

test.describe('authenticated app', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials();
    await signIn(page, CREDENTIALS.email!, CREDENTIALS.password!);
  });

  test('dashboard renders summary stats from the analytics endpoint', async ({ page }) => {
    await openView(page, 'dashboard', /Monthly Overview/);

    await expect(page.getByText('Net Balance').first()).toBeVisible();
    await expect(page.getByText('savings rate this month')).toBeVisible();
    // The `stats` memo in DashboardView defaults every field to 0 precisely so
    // an undefined payload cannot reach the DOM — assert that guard holds.
    await expectNoNaN(page);
  });

  test('accounts view shows the net worth header and filter tabs', async ({ page }) => {
    await openView(page, 'accounts', /Total Net Worth \(Active Accounts\)/);

    await expect(page.getByRole('button', { name: 'Add Account' })).toBeVisible();
    await expect(page.getByText('Bank Accounts').first()).toBeVisible();
    await expect(page.getByText('Mobile Money').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Accounts' })).toBeVisible();
  });

  test('transactions view exposes filters and filtered summaries', async ({ page }) => {
    await openView(page, 'transactions', /Filtered Income/);

    await expect(page.getByText('Filtered Expense')).toBeVisible();
    await expect(page.getByText('Net Difference')).toBeVisible();
    await expect(page.getByPlaceholder('Search description, category, notes...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Transaction' })).toBeVisible();
    await expectNoNaN(page);
  });

  test('budgets view offers the month navigator and totals', async ({ page }) => {
    await openView(page, 'budgets', /Selected Period/);

    await expect(page.getByText(/Budgets for /)).toBeVisible();
    await expect(page.getByText('Total Planned')).toBeVisible();
    await expect(page.getByText('Total Spent (Actual)')).toBeVisible();
    await expect(page.getByText('Variance (Remaining)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set Budget' })).toBeVisible();

    // Month navigation must re-query D1 for a different period.
    const before = await page.getByText(/Budgets for /).textContent();
    await page.getByTitle('Next month').click();
    await expect(page.getByText(/Budgets for /)).not.toHaveText(before!);
  });

  test('settings view exposes categories and date-range exports', async ({ page }) => {
    await openView(page, 'settings', /^Categories$/);

    await expect(page.getByRole('button', { name: 'Categories' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excel & Templates' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export Reports' })).toBeVisible();

    await page.getByRole('button', { name: 'Export Reports' }).click();
    await expect(page.getByLabel('From date')).toBeVisible();
    await expect(page.getByLabel('To date')).toBeVisible();
    await expect(page.getByLabel('Filter by Type')).toBeVisible();
  });

  test('exports transactions across multiple months and excludes rows outside the range', async ({ page }) => {
    const includedDescriptions = [`PW Range Start ${Date.now()}`, `PW Range End ${Date.now()}`];
    const outsideDescription = `PW Range Outside ${Date.now()}`;
    const createdIds: string[] = [];
    const fixtures = [
      { date: '2099-12-01', description: includedDescriptions[0] },
      { date: '2100-01-31', description: includedDescriptions[1] },
      { date: '2099-11-30', description: outsideDescription },
    ];

    try {
      for (const fixture of fixtures) {
        const response = await page.request.post('/api/transactions', {
          data: {
            ...fixture,
            amount: 10,
            category_id: null,
            account_id: null,
            category_name: 'Range Test',
            type: 'expense',
            is_recurring: false,
            notes: null,
          },
        });
        expect(response.status()).toBe(201);
        const row = (await response.json()) as { id: string };
        createdIds.push(row.id);
      }

      await openView(page, 'settings', /^Categories$/);
      await page.getByRole('button', { name: 'Export Reports' }).click();
      await page.getByLabel('From date').fill('2099-12-01');
      await page.getByLabel('To date').fill('2100-01-31');
      await expect(page.getByText('Matching Records').locator('..')).toContainText('2');

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('walletwise_report_2099-12-01_to_2100-01-31.csv');
      const exportedCsv = await readFile((await download.path())!, 'utf8');
      for (const description of includedDescriptions) expect(exportedCsv).toContain(description);
      expect(exportedCsv).not.toContain(outsideDescription);

      await page.getByLabel('From date').fill('2100-02-01');
      await expect(page.getByRole('alert')).toHaveText('The start date must be on or before the end date.');
      await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    } finally {
      await Promise.all(createdIds.map((id) => page.request.delete(`/api/transactions/${id}`)));
    }
  });

  test('budget tab imports only budget rows from a mixed spreadsheet', async ({ page }) => {
    const month = `${2200 + (Date.now() % 500)}-12`;
    const excludedDescription = `PW Excluded Transaction ${Date.now()}`;
    let category: { id: string; name: string } | undefined;
    let importedBudgetId: string | undefined;

    await openView(page, 'budgets', /Selected Period/);
    await expect(page.getByLabel('Import budgets spreadsheet')).toBeVisible();
    const categoriesResponse = await page.request.get('/api/categories');
    const categories = (await categoriesResponse.json()) as { id: string; name: string; type: string }[];
    category = categories.find((item) => item.type === 'expense');
    expect(category).toBeTruthy();
    await page.route('**/api/ai/parse-spreadsheet', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transactions: [{
            date: '2099-12-01',
            amount: 18,
            description: excludedDescription,
            category: 'Excluded transaction category',
            account: '',
            type: 'expense',
            is_recurring: false,
          }],
          budgets: [{ month, category: category!.name, planned_amount: 320 }],
          warnings: [],
          stats: { sheets: 1, rows: 2, chunks: 1, aiChunks: 1, fallbackChunks: 0, dropped: 0 },
          source: 'ai',
        }),
      })
    );

    try {
      await page.getByLabel('Import budgets spreadsheet').setInputFiles({
        name: 'mixed-finance.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`Month,Category,PlannedAmount\n${month},Test,320`),
      });
      await expect(page.getByRole('heading', { name: 'Review Import' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(`${category!.name} budget`)).toBeVisible();
      await expect(page.getByText(excludedDescription)).toHaveCount(0);

      await page.getByRole('button', { name: 'Confirm Import' }).click();
      await expect(page.getByText('Successfully imported 1 budgets.')).toBeVisible({ timeout: 20_000 });

      const transactionsResponse = await page.request.get('/api/transactions');
      const transactions = (await transactionsResponse.json()) as { description: string }[];
      expect(transactions.some((transaction) => transaction.description === excludedDescription)).toBe(false);

      const budgetsResponse = await page.request.get('/api/budgets');
      const budgets = (await budgetsResponse.json()) as { id: string; month: string; category_id: string }[];
      importedBudgetId = budgets.find((budget) => budget.month === month && budget.category_id === category!.id)?.id;
      expect(importedBudgetId).toBeTruthy();
    } finally {
      if (!importedBudgetId) {
        const budgetsResponse = await page.request.get('/api/budgets');
        const budgets = (await budgetsResponse.json()) as { id: string; month: string; category_id: string }[];
        importedBudgetId = budgets.find((budget) => budget.month === month && budget.category_id === category?.id)?.id;
      }
      if (importedBudgetId) await page.request.delete(`/api/budgets/${importedBudgetId}`);
    }
  });

  test('account deletion is read-only during recovery and can be restored', async ({ page }) => {
    await openView(page, 'settings', /^Categories$/);
    await page.getByRole('button', { name: 'Account deletion' }).click();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');

    const scheduleResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/user/account-deletion' &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Schedule account deletion' }).click();
    const scheduleResponse = await scheduleResponsePromise;
    expect(scheduleResponse.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Account deletion scheduled' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Account preview' })).toBeVisible();
    await expect(addRecordButton(page)).toHaveCount(0);
    expect((await page.request.get('/api/transactions')).status()).toBe(200);
    expect((await page.request.post('/api/transactions', { data: {} })).status()).toBe(403);

    await page.getByRole('button', { name: 'Restore account' }).click();
    await expect(page.getByRole('button', { name: 'Add Category' })).toBeVisible({ timeout: 20_000 });

    const profileResponse = await page.request.get('/api/user/me');
    expect(profileResponse.status()).toBe(200);
    const profile = (await profileResponse.json()) as { deletionScheduledFor: string | null };
    expect(profile.deletionScheduledFor).toBeNull();
  });

  test('analytics view computes all-time summaries without NaN', async ({ page }) => {
    const errors = trackRuntimeErrors(page);
    await openView(page, 'analytics', /All-Time Income/);

    await expect(page.getByText('All-Time Expenses')).toBeVisible();
    await expect(page.getByText('Net Savings')).toBeVisible();
    await expect(page.getByText('Overall Savings Rate')).toBeVisible();
    await expectNoNaN(page);
    // Recharts renders SVG; an empty container means the payload never landed.
    await expect(page.locator('svg').first()).toBeAttached();

    expect(errors, `runtime errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('creates and then deletes an account, masking the account number', async ({ page }) => {
    const name = `PW Test Account ${Date.now()}`;
    await openView(page, 'accounts', /Total Net Worth \(Active Accounts\)/);

    await page.getByRole('button', { name: 'Add Account' }).click();
    await page.getByPlaceholder('e.g. Daily Checking').fill(name);
    await page.getByPlaceholder('0.00').fill('1234.56');
    await page.getByPlaceholder('e.g. FNB, Standard Bank, MTN').fill('PW Bank');
    // A full account number must be reduced to its last four before it is
    // persisted — SECURITY.md requires full numbers are never stored.
    await page.getByPlaceholder('•••• 4821').fill('9876543210');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });

    const card = page.locator('div.bg-surface').filter({ hasText: name }).last();
    await expect(card.getByText(/•••• ?3210/).first()).toBeVisible();

    // Clean up through the real confirmation dialog.
    await card.hover();
    await card.getByTitle('Delete account').click();
    await page.getByRole('button', { name: 'Confirm Delete' }).click();
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 20_000 });
  });

  test('creates and then deletes a transaction', async ({ page }) => {
    const description = `PW Groceries ${Date.now()}`;
    await openView(page, 'transactions', /Filtered Income/);

    await page.getByRole('button', { name: 'New Transaction' }).click();
    await page.getByPlaceholder('0.00').fill('42.50');
    await page.getByPlaceholder('e.g. Grocery store, Client invoice').fill(description);

    // The dialog is taller than a phone viewport, so its submit lives inside the
    // card's own scroll container (see BUG-010). Bring it into view explicitly
    // before clicking rather than relying on the implicit scroll.
    const submit = page.getByRole('button', { name: 'Record Transaction' });
    await submit.scrollIntoViewIfNeeded();
    await submit.click();

    // The dialog closing is the authoritative signal that the write succeeded;
    // waiting only on the row text hides whether the save or the list is at
    // fault.
    await expect(submit).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 20_000 });

    // Anchor on the row's `group` class, which is what the hover-revealed
    // action buttons hang off; a bare `div` filter matches wrapper elements too.
    const row = page.locator('div.group').filter({ hasText: description }).last();
    await row.hover();
    await row.getByTitle('Delete transaction').first().click();
    await page.getByRole('button', { name: 'Confirm Delete' }).click();

    await expect(page.getByText(description)).toHaveCount(0, { timeout: 20_000 });
  });

  test('linking an edited transaction updates its account balance', async ({ page }) => {
    const accountName = `PW Ledger Account ${Date.now()}`;
    const description = `PW Linked Expense ${Date.now()}`;

    await openView(page, 'accounts', /Total Net Worth \(Active Accounts\)/);
    await page.getByRole('button', { name: 'Add Account' }).click();
    await page.getByPlaceholder('e.g. Daily Checking').fill(accountName);
    await page.getByPlaceholder('0.00').fill('1000');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText(accountName).first()).toBeVisible({ timeout: 20_000 });

    const getAccountBalance = async () =>
      page.evaluate(async (name) => {
        const response = await fetch('/api/accounts');
        if (!response.ok) throw new Error(`Account request failed: ${response.status}`);
        const rows = (await response.json()) as { name: string; balance: number }[];
        return rows.find((account) => account.name === name)?.balance;
      }, accountName);

    await openView(page, 'transactions', /Filtered Income/);
    await page.getByRole('button', { name: 'New Transaction' }).click();
    await page.getByPlaceholder('0.00').fill('42.50');
    await page.getByPlaceholder('e.g. Grocery store, Client invoice').fill(description);
    const createButton = page.getByRole('button', { name: 'Record Transaction' });
    await createButton.scrollIntoViewIfNeeded();
    await createButton.click();
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(getAccountBalance).toBe(1000);

    const row = page.locator('div.group').filter({ hasText: description }).last();
    await row.hover();
    await row.getByTitle('Edit transaction').click();
    await page.locator('#transaction-account').selectOption({ label: `${accountName} · bank` });
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();
    await expect.poll(getAccountBalance).toBeCloseTo(957.5, 2);

    const linkedRow = page.locator('div.group').filter({ hasText: description }).last();
    await linkedRow.hover();
    await linkedRow.getByTitle('Delete transaction').click();
    await page.getByRole('button', { name: 'Confirm Delete' }).click();
    await expect.poll(getAccountBalance).toBe(1000);

    await openView(page, 'accounts', /Total Net Worth \(Active Accounts\)/);
    const card = page.locator('div.bg-surface').filter({ hasText: accountName }).last();
    await card.hover();
    await card.getByTitle('Delete account').click();
    await page.getByRole('button', { name: 'Confirm Delete' }).click();
    await expect(page.getByText(accountName)).toHaveCount(0, { timeout: 20_000 });
  });

  test('imports a transaction with an optional account column', async ({ page }) => {
    const accountName = `PW Import Account ${Date.now()}`;
    const description = `PW Imported Expense ${Date.now()}`;
    const amount = 23.75;

    await openView(page, 'accounts', /Total Net Worth \(Active Accounts\)/);
    await page.getByRole('button', { name: 'Add Account' }).click();
    await page.getByPlaceholder('e.g. Daily Checking').fill(accountName);
    await page.getByPlaceholder('0.00').fill('500');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText(accountName).first()).toBeVisible({ timeout: 20_000 });

    await openView(page, 'transactions', /Filtered Income/);
    await expect(page.getByLabel('Import transactions spreadsheet')).toBeVisible();
    const csv = [
      'Date,Description,Category,Type,Amount,Recurring,Account,Notes',
      `2026-10-03,${description},Groceries,expense,${amount},false,${accountName},`,
    ].join('\n');
    const parseResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/ai/parse-spreadsheet'
    );
    await page.getByLabel('Import transactions spreadsheet').setInputFiles({
      name: 'account-transactions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    const parseResponse = await parseResponsePromise;
    expect(parseResponse.ok()).toBeTruthy();
    const parsed = (await parseResponse.json()) as { transactions: { account: string }[] };
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0].account.toLowerCase()).toBe(accountName.toLowerCase());

    await expect(page.getByRole('heading', { name: 'Review Import' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Confirm Import' }).click();
    await expect(page.getByText(/Successfully imported 1 transactions/)).toBeVisible({ timeout: 20_000 });

    const readAccountBalance = async () =>
      page.evaluate(async (name) => {
        const response = await fetch('/api/accounts');
        if (!response.ok) throw new Error(`Account request failed: ${response.status}`);
        const rows = (await response.json()) as { name: string; balance: number }[];
        return rows.find((account) => account.name === name)?.balance;
      }, accountName);

    const transactionsResponse = await page.request.get('/api/transactions');
    const rows = (await transactionsResponse.json()) as { id: string; description: string; account_id: string | null }[];
    const imported = rows.find((transaction) => transaction.description === description);
    const accountsResponse = await page.request.get('/api/accounts');
    const accountRows = (await accountsResponse.json()) as { id: string; name: string }[];
    const importedAccount = accountRows.find((account) => account.name === accountName);
    expect(imported?.account_id, JSON.stringify(imported)).toBe(importedAccount?.id);
    await expect.poll(readAccountBalance).toBeCloseTo(500 - amount, 2);

    await openView(page, 'accounts', /Total Net Worth \(Active Accounts\)/);
    const card = page.locator('div.bg-surface').filter({ hasText: accountName }).last();
    await card.hover();
    await card.getByTitle('Delete account').click();
    await page.getByRole('button', { name: 'Confirm Delete' }).click();
    await expect(page.getByText(accountName)).toHaveCount(0, { timeout: 20_000 });

    const afterAccountDelete = await page.request.get('/api/transactions');
    const remainingRows = (await afterAccountDelete.json()) as { id: string; description: string; account_id: string | null }[];
    const remainingTransaction = remainingRows.find((transaction) => transaction.id === imported!.id);
    expect(remainingTransaction?.description).toBe(description);
    expect(remainingTransaction?.account_id).toBeNull();
    await page.request.delete(`/api/transactions/${imported!.id}`);
  });
});
