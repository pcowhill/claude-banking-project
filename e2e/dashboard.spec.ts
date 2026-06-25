import { test, expect, type Page } from '@playwright/test';

const CUSTOMER = 'http://localhost:5173';

const DEMO = {
  customer: { email: 'avery.customer@example.com', password: 'Customer123!' },
};

async function customerLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(CUSTOMER + '/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// Customer banking dashboard (v0.4.0): accounts overview → account detail →
// transactions (pending vs posted) with search/filter, plus the statements
// placeholder. Requires the seeded demo data (CI resets+seeds before the run).
test.describe('customer banking dashboard', () => {
  test('overview lists accounts with a combined total and links into detail', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);

    await expect(page.getByRole('heading', { name: /welcome back, avery/i })).toBeVisible();
    await expect(page.getByText(/total available across your accounts/i)).toBeVisible();

    // Both accounts appear as cards that link into their detail page.
    const checking = page.getByRole('link', { name: /everyday checking/i });
    await expect(checking).toBeVisible();
    await expect(page.getByRole('link', { name: /goal savings/i })).toBeVisible();

    await checking.click();
    await expect(page).toHaveURL(/\/accounts\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
  });

  test('account detail shows pending vs posted transactions and a running balance', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);
    await page.getByRole('link', { name: /everyday checking/i }).click();

    // A posted everyday transaction and the running balance column.
    await expect(page.getByText('Rent — Maple Court Apartments').first()).toBeVisible();
    // The pending group with its clearly-labelled pending authorization.
    await expect(page.getByText(/coffee roasters \(pending authorization\)/i)).toBeVisible();
    // The pending incoming deposit is visible too.
    await expect(page.getByText(/mobile check deposit \(pending\)/i)).toBeVisible();
  });

  test('search and status filter narrow the transaction list', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);
    await page.getByRole('link', { name: /everyday checking/i }).click();

    // Search by merchant: groceries match, payroll does not.
    await page.getByRole('searchbox', { name: /search transactions/i }).fill('Simmons');
    await expect(page.getByText(/groceries — simmons market/i).first()).toBeVisible();
    await expect(page.getByText(/payroll/i)).toHaveCount(0);

    // Clear, then filter to pending only: the pending hold shows, a posted payroll does not.
    await page.getByRole('searchbox', { name: /search transactions/i }).fill('');
    await page.getByLabel(/filter by status/i).selectOption('pending');
    await expect(page.getByText(/coffee roasters \(pending authorization\)/i)).toBeVisible();
    await expect(page.getByText(/payroll/i)).toHaveCount(0);
  });

  test('the statements placeholder is reachable and clearly not-yet-available', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);
    await page.getByRole('link', { name: /statements & documents/i }).first().click();
    await expect(page).toHaveURL(/\/statements$/);
    await expect(page.getByRole('heading', { name: /statements & documents/i })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(page.getByText(/not available yet/i).first()).toBeVisible();
  });
});

// v0.3.0 review follow-ups (R-01 scroll behaviour, R-02 session-aware entry points).
test.describe('navigation & session-aware entry points', () => {
  test('navigating to another page scrolls back to the top (R-01)', async ({ page }) => {
    await page.goto(CUSTOMER + '/about');
    await page.evaluate(() => window.scrollTo(0, 1500));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

    await page
      .getByRole('navigation', { name: /primary/i })
      .getByRole('link', { name: /^checking$/i })
      .click();
    await expect(page).toHaveURL(/\/checking$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test('the Security link deep-links to the About security section (R-01)', async ({ page }) => {
    await page.goto(CUSTOMER + '/');
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: /^security$/i })
      .click();
    await expect(page).toHaveURL(/\/about#security$/);
    await expect(page.getByRole('heading', { name: /protection built in from the start/i })).toBeVisible();
    // The page scrolled DOWN to the section rather than staying at the top.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(150);
  });

  test('logged-in visitors get "Visit your Dashboard" instead of Log in CTAs (R-02)', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);

    await page.goto(CUSTOMER + '/');
    await expect(page.getByRole('link', { name: /visit your dashboard/i }).first()).toBeVisible();
    // No "Log in" / "Open account" entry points anywhere for a signed-in user.
    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^log in$/i })).toHaveCount(0);
  });

  test('visiting /login while signed in shows an already-logged-in panel (R-02)', async ({ page }) => {
    await customerLogin(page, DEMO.customer.email, DEMO.customer.password);

    await page.goto(CUSTOMER + '/login');
    await expect(page.getByRole('heading', { name: /already signed in/i })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /visit your dashboard/i })).toBeVisible();

    // Logging out from the panel returns the visitor to the sign-in form.
    await page.getByRole('main').getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('heading', { name: /log in to meridian/i })).toBeVisible();
  });
});
