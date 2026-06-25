import { test, expect } from '@playwright/test';

const CUSTOMER = 'http://localhost:5173';
const OPERATIONS = 'http://localhost:5174';

test.describe('customer app', () => {
  test('marketing home loads with a simulation disclaimer', async ({ page }) => {
    await page.goto(CUSTOMER + '/');
    await expect(page.getByRole('heading', { name: /modern banking/i })).toBeVisible();
    // The always-on simulation banner must be present.
    await expect(page.getByText(/not a real bank/i).first()).toBeVisible();
  });

  test('dashboard shell renders derived balances', async ({ page }) => {
    await page.goto(CUSTOMER + '/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByText('Everyday Checking')).toBeVisible();
  });
});

test.describe('operations app', () => {
  test('operations console loads and states that it simulates bank operations', async ({ page }) => {
    await page.goto(OPERATIONS + '/');
    await expect(page.getByRole('heading', { name: /operations overview/i })).toBeVisible();
    await expect(page.getByText(/simulates/i).first()).toBeVisible();
  });
});
