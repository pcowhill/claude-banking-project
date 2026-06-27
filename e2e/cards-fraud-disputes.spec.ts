import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for v0.8.0 — cards, fraud, disputes. Everything is a local
 * SIMULATION. The DB is reset+seeded before the e2e run, so Avery has two seeded
 * cards, a seeded fraud alert (QuickFuel), and a seeded open dispute (Trattoria
 * Romana, $42.10). Card lifecycle moves no money; a confirmed fraud / upheld
 * dispute reverses the entry (a ledger status change) and shows the "Reversed"
 * tag in the operator console.
 *
 * Serial so the shared seeded items aren't raced within this file.
 */
test.describe.configure({ mode: 'serial' });

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

test.describe('cards, fraud & disputes (v0.8.0)', () => {
  test('a customer freezes a card in the wallet', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.goto(CUSTOMER + '/wallet');
    await expect(page.getByRole('heading', { name: /your cards/i })).toBeVisible();

    // The first seeded card is active → freeze it and see the status flip.
    const freeze = page.getByRole('button', { name: /^freeze$/i }).first();
    await expect(freeze).toBeVisible();
    await freeze.click();
    await expect(page.getByText('Frozen', { exact: true }).first()).toBeVisible();
    // It can now be unfrozen.
    await expect(page.getByRole('button', { name: /^unfreeze$/i }).first()).toBeVisible();
  });

  test('a customer disputes a posted transaction (it flips to Disputed)', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.getByRole('link', { name: /everyday checking/i }).click();
    await expect(page).toHaveURL(/\/accounts\/[^/]+$/);

    // Open the inline dispute form on the first posted, not-yet-disputed row.
    await page.getByRole('button', { name: /^dispute$/i }).first().click();
    await page.locator('select[id^="dispute-reason-"]').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /file dispute/i }).click();

    // The row now shows a "Disputed" badge.
    await expect(page.getByText('Disputed', { exact: true }).first()).toBeVisible();
  });

  test('an operator confirms the seeded fraud alert → the charge is reversed (Reversed tag)', async ({
    page,
  }) => {
    await operatorLogin(page, OPS.email, OPS.password);
    await page.getByRole('link', { name: /request queues/i }).click();
    await expect(page.getByRole('heading', { name: /^request queues$/i })).toBeVisible();

    const card = page.getByTestId('queue-card').filter({ hasText: /unusual card activity flagged/i });
    await expect(card).toBeVisible();
    await card.getByTestId('queue-summary').click();

    // The detail panel shows the fraud context + the confirm/dismiss copy.
    await expect(page.getByText(/confirm fraud/i).first()).toBeVisible();

    // Approve = confirm fraud → reverse the charge + freeze the card.
    await card.getByRole('button', { name: /^approve$/i }).click();

    // The item keeps "Approved" AND gains the "Reversed" tag (task R-03).
    await expect(card.getByText('Approved', { exact: true })).toBeVisible();
    await expect(card.getByText('Reversed', { exact: true })).toBeVisible();
  });

  test('an operator upholds the seeded dispute → the charge is reversed (Reversed tag)', async ({
    page,
  }) => {
    await operatorLogin(page, OPS.email, OPS.password);
    await page.getByRole('link', { name: /request queues/i }).click();

    const card = page.getByTestId('queue-card').filter({ hasText: /disputed card charge — trattoria romana/i });
    await expect(card).toBeVisible();
    await card.getByTestId('queue-summary').click();

    // The dispute context explains approve = uphold (reverses the charge).
    await expect(page.getByText(/uphold/i).first()).toBeVisible();

    await card.getByRole('button', { name: /^approve$/i }).click();
    await expect(card.getByText('Approved', { exact: true })).toBeVisible();
    await expect(card.getByText('Reversed', { exact: true })).toBeVisible();
  });
});
