import { test, expect } from '@playwright/test';

const CUSTOMER = 'http://localhost:5173';
const OPERATIONS = 'http://localhost:5174';

// Shallow "does it load, is it clearly a simulation, is auth wired?" checks for
// the unauthenticated surfaces. The full login journeys live in auth.spec.ts.

test.describe('customer app (public)', () => {
  test('marketing home loads with a simulation disclaimer', async ({ page }) => {
    await page.goto(CUSTOMER + '/');
    await expect(page.getByRole('heading', { name: /modern banking/i })).toBeVisible();
    // The always-on simulation banner must be present.
    await expect(page.getByText(/not a real bank/i).first()).toBeVisible();
  });

  test('the dashboard is protected and redirects unauthenticated visitors to login', async ({
    page,
  }) => {
    await page.goto(CUSTOMER + '/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /log in to meridian/i })).toBeVisible();
  });
});

test.describe('operations app (public)', () => {
  test('shows the operator login and states that it simulates bank operations', async ({ page }) => {
    await page.goto(OPERATIONS + '/');
    await expect(page.getByRole('heading', { name: /operator sign-in/i })).toBeVisible();
    await expect(page.getByText(/simulates/i).first()).toBeVisible();
  });
});
