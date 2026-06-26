import { test, expect, type Page } from '@playwright/test';

const CUSTOMER = 'http://localhost:5173';
const OPERATIONS = 'http://localhost:5174';

// Seeded, NON-SECRET demo accounts (see README). The DB is reset+seeded before
// the e2e run (CI: `npm run db:reset`).
const DEMO = {
  customer: { email: 'avery.customer@example.com', password: 'Customer123!' },
  joint: { email: 'jordan.joint@example.com', password: 'Joint123!' },
  ops: { email: 'sam.operator@example.com', password: 'Operator123!' },
};

async function customerLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(CUSTOMER + '/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /continue/i }).click();
}

async function operatorLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(OPERATIONS + '/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
}

test.describe('customer authentication', () => {
  test('a customer can log in, see only their own accounts, then log out', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /welcome back, avery/i })).toBeVisible();
    // Both of Avery's accounts, with derived balances and the recent-activity card.
    await expect(page.getByText('Everyday Checking')).toBeVisible();
    await expect(page.getByText('Goal Savings')).toBeVisible();
    await expect(page.getByRole('heading', { name: /recent sign-in activity/i })).toBeVisible();

    // Logging out returns to the public site (the logged-out header nav reappears).
    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('banner').getByRole('button', { name: /^log in$/i })).toBeVisible();
  });

  test('invalid credentials show an error and do not sign in', async ({ page }) => {
    // A non-existent email avoids touching any real demo account's lockout state.
    await customerLogin(page, 'no-such-user@example.com', 'wrong-password');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a joint customer sees only the shared account (RBAC)', async ({ page }) => {
    await customerLogin(page, DEMO.joint.email, DEMO.joint.password);
    await expect(page.getByRole('heading', { name: /welcome back, jordan/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Everyday Checking/i })).toBeVisible();
    // Jordan was NOT granted savings ACCESS, so no savings ACCOUNT appears. (v0.6.0
    // seeds a PENDING joint invitation to savings, which surfaces as an invitation
    // card — not an account link — and grants nothing until accepted; assert on the
    // account link specifically so the RBAC check ignores that pending invite.)
    await expect(page.getByRole('link', { name: /Goal Savings/i })).toHaveCount(0);
  });
});

test.describe('operations authentication', () => {
  test('an operator can sign in to the console', async ({ page }) => {
    await operatorLogin(page, DEMO.ops.email, DEMO.ops.password);
    await expect(page.getByRole('heading', { name: /operations overview/i })).toBeVisible();
    // Operator identity shows in the console header.
    await expect(page.getByRole('banner').getByText('Sam Operator')).toBeVisible();
  });

  test('a customer is rejected from the staff-only operations console', async ({ page }) => {
    await operatorLogin(page, DEMO.customer.email, DEMO.customer.password);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/bank staff only/i)).toBeVisible();
    // Still on the login screen — never reaches the console.
    await expect(page.getByRole('heading', { name: /operator sign-in/i })).toBeVisible();
  });
});
