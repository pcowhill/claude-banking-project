import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for v0.7.0 — money movement. Everything is a local
 * SIMULATION. The DB is reset+seeded before the e2e run (CI: `npm run db:reset`),
 * so the seeded "Mobile check deposit awaiting review ($320.00)" item is pending
 * and approvable. Customer money moves only via ledger entries; an operator
 * approval posts a reviewable movement; a reversal flips it back.
 */

const CUSTOMER = 'http://localhost:5173';
const OPERATIONS = 'http://localhost:5174';

const AVERY = { email: 'avery.customer@example.com', password: 'Customer123!' };
const OPS = { email: 'sam.operator@example.com', password: 'Operator123!' };

async function customerLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(CUSTOMER + '/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function operatorLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(OPERATIONS + '/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('heading', { name: /operations overview/i })).toBeVisible();
}

test.describe('money movement (v0.7.0)', () => {
  test('a customer transfers money between their own accounts (both legs post)', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.goto(CUSTOMER + '/move-money');
    await expect(page.getByRole('heading', { name: /^move money$/i })).toBeVisible();

    // Transfer is the default tab. Pick the two seeded accounts (sorted: Everyday
    // Checking, then Goal Savings) — choose the source first so the destination
    // select excludes it.
    await page.locator('#transfer-from').selectOption({ index: 1 });
    await page.locator('#transfer-to').selectOption({ index: 1 });
    await page.locator('#transfer-amount').fill('25');
    await page.getByRole('button', { name: /transfer now/i }).click();

    // Immediate confirmation with the two affected accounts' derived balances.
    await expect(page.getByText(/transfer complete/i)).toBeVisible();
    await expect(page.getByText(/you moved \$25\.00/i)).toBeVisible();
  });

  test('a customer submits a mobile check deposit that is queued for review', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.goto(CUSTOMER + '/move-money');

    await page.getByRole('tab', { name: /deposit a check/i }).click();
    await page.locator('#deposit-account').selectOption({ index: 1 });
    await page.locator('#deposit-amount').fill('142.50');
    await page.getByRole('button', { name: /submit deposit/i }).click();

    // Reviewable: a reference + a clear "pending until an operator posts it" note.
    await expect(page.getByText(/submitted for review/i)).toBeVisible();
    await expect(page.getByText(/MOV-/)).toBeVisible();
    await expect(page.getByText(/an operator must approve every external movement/i)).toBeVisible();
  });

  test('the dashboard quick links route to Move money', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.getByRole('link', { name: /transfers/i }).first().click();
    await expect(page).toHaveURL(/\/move-money$/);
    await expect(page.getByRole('heading', { name: /^move money$/i })).toBeVisible();
  });

  test('an operator sees the movement context, approves it (posts), then reverses it', async ({
    page,
  }) => {
    await operatorLogin(page, OPS.email, OPS.password);
    await page.getByRole('link', { name: /request queues/i }).click();
    await expect(page.getByRole('heading', { name: /^request queues$/i })).toBeVisible();

    // Open the seeded mobile-check deposit (a reviewable money movement).
    const card = page.getByTestId('queue-card').filter({ hasText: /mobile check deposit awaiting review/i });
    await expect(card).toBeVisible();
    await card.getByTestId('queue-summary').click();

    // The detail panel shows the money-movement context + the "approving posts it" copy.
    await expect(page.getByRole('heading', { name: /^money movement$/i })).toBeVisible();
    await expect(page.getByText('$320.00', { exact: true })).toBeVisible();
    await expect(page.getByText(/approving posts this movement to the ledger/i)).toBeVisible();

    // Approve from the card; the open detail panel reacts to the live state.
    await card.getByRole('button', { name: /^approve$/i }).click();

    // The reverse affordance appears only once the movement is posted (approved).
    await expect(page.getByRole('heading', { name: /^reverse movement$/i })).toBeVisible();
    await page.locator('#ops-reverse-reason').fill('E2E reversal — check returned (simulated)');
    await page.getByRole('button', { name: /^reverse movement$/i }).click();

    // The movement now shows the "Reversed" tag (v0.8.0 R-03) and the affordance
    // is gone. Scope to THIS card — other reversed items may exist in the shared
    // seeded DB (fraud/dispute reversals also surface a "Reversed" tag now).
    await expect(card.getByText('Reversed', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^reverse movement$/i })).toHaveCount(0);
  });
});
