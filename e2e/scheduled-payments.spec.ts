import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for v0.9.0 — the simulation clock + recurring/scheduled
 * payments. Everything is a local SIMULATION. The DB is reset+seeded before the
 * run, so the clock starts at seed time and the two seeded schedules (a monthly
 * internal transfer due in 3 days; a monthly bill pay due in 5 days) are unfired.
 *
 * Correctness of firing/money-discipline is covered exhaustively by the backend
 * integration tests; these journeys prove the two UIs are wired up: a customer
 * creates/cancels a schedule and sees the simulated date, and an operator advances
 * the clock and watches due schedules fire.
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

test.describe('scheduled payments + simulation clock (v0.9.0)', () => {
  test('a customer schedules a bill payment, sees it listed, then cancels it', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.goto(CUSTOMER + '/scheduled-payments');
    await expect(page.getByRole('heading', { name: /^scheduled payments$/i })).toBeVisible();

    // The current simulated date is shown so the customer knows what "now" the
    // scheduler reads from.
    await expect(page.getByText(/current simulated date/i)).toBeVisible();

    // Schedule a one-time bill payment (a bill pay needs only one account).
    await page.getByRole('button', { name: /pay a bill/i }).click();
    await page.locator('#schedule-from').selectOption({ index: 1 });
    await page.locator('#schedule-biller').fill('E2E Test Biller');
    await page.locator('#schedule-amount').fill('12.34');
    await page.locator('#schedule-frequency').selectOption('once');
    await page.getByRole('button', { name: /^schedule payment$/i }).click();

    // Confirmation, and the new schedule appears in the list (nothing moved yet).
    await expect(page.getByText(/your schedule was created/i)).toBeVisible();
    const row = page.locator('li').filter({ hasText: 'E2E Test Biller' });
    await expect(row).toBeVisible();
    await expect(row.getByText('$12.34')).toBeVisible();

    // Cancel it (so it never fires) and see it flip to Cancelled.
    await row.getByRole('button', { name: /cancel schedule/i }).click();
    await expect(row.getByText(/^cancelled$/i)).toBeVisible();
  });

  test('the dashboard quick link routes to Scheduled payments', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.getByRole('link', { name: /scheduled payments/i }).first().click();
    await expect(page).toHaveURL(/\/scheduled-payments$/);
    await expect(page.getByRole('heading', { name: /^scheduled payments$/i })).toBeVisible();
  });

  test('an operator advances the simulation clock and watches a due schedule fire', async ({
    page,
  }) => {
    await operatorLogin(page, OPS.email, OPS.password);

    // Reach the Simulation clock console via the (now promoted) nav link.
    await page.getByRole('link', { name: /simulation clock/i }).click();
    await expect(page.getByRole('heading', { name: /^simulation clock$/i })).toBeVisible();
    await expect(page.getByText(/simulated now/i)).toBeVisible();

    // The seeded customer schedules are listed for the operator.
    await expect(page.getByText(/customer payment schedules/i)).toBeVisible();

    // Jump a week — the seeded monthly internal transfer (due in 3 days) fires and
    // posts $200.00, shown in the "Last advance" summary.
    await page.getByRole('button', { name: /\+1 week/i }).click();
    await expect(page.getByText(/last advance/i)).toBeVisible();
    const fired = page.locator('li').filter({ hasText: /transfer between your accounts/i });
    await expect(fired.first()).toBeVisible();
    await expect(fired.first().getByText('Posted $200.00')).toBeVisible();
  });
});
