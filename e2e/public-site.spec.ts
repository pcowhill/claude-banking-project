import { test, expect, type Page } from '@playwright/test';

const CUSTOMER = 'http://localhost:5173';

// Public marketing site (v0.3.0). Verifies the new pages render, the nav and
// CTAs work, and the simulation framing stays visible. No auth required.

test.describe('public marketing site', () => {
  test('home page renders the hero, products, and simulation disclaimer', async ({ page }) => {
    await page.goto(CUSTOMER + '/');
    await expect(page.getByRole('heading', { name: /modern banking/i })).toBeVisible();
    // Simulation framing is always visible.
    await expect(page.getByText(/not a real bank/i).first()).toBeVisible();
    // Product highlights link out to the product pages.
    await expect(page.getByRole('link', { name: /everyday checking/i })).toBeVisible();
  });

  test('primary nav reaches every marketing page', async ({ page }) => {
    await page.goto(CUSTOMER + '/');
    const nav = page.getByRole('navigation', { name: /primary/i });

    await nav.getByRole('link', { name: /^checking$/i }).click();
    await expect(page).toHaveURL(/\/checking$/);
    await expect(page.getByRole('heading', { name: /checking that stays out of your way/i })).toBeVisible();

    await nav.getByRole('link', { name: /^savings$/i }).click();
    await expect(page).toHaveURL(/\/savings$/);
    await expect(page.getByRole('heading', { name: /save with intention/i })).toBeVisible();

    await nav.getByRole('link', { name: /^cards$/i }).click();
    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.getByText(/not built yet/i)).toBeVisible();

    await nav.getByRole('link', { name: /loans & cds/i }).click();
    await expect(page).toHaveURL(/\/borrow$/);
    await expect(page.getByText(/not built yet/i)).toBeVisible();

    await nav.getByRole('link', { name: /^about$/i }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { name: /a bank you can read like a book/i })).toBeVisible();
  });

  test('coming-soon pages are clearly fictional and tagged with a milestone', async ({ page }) => {
    await page.goto(CUSTOMER + '/cards');
    await expect(page.getByRole('heading', { name: /cards, with controls/i })).toBeVisible();
    await expect(page.getByText(/v0\.8\.0/).first()).toBeVisible();
  });

  test('the open-account CTA leads to the working login', async ({ page }) => {
    await page.goto(CUSTOMER + '/open-account');
    await expect(page.getByRole('heading', { name: /account opening is coming/i })).toBeVisible();
    await page.getByRole('link', { name: /explore with a demo login/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /log in to meridian/i })).toBeVisible();
  });

  test('the mobile menu opens and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(CUSTOMER + '/');
    const toggle = page.getByRole('button', { name: /open menu/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    await mobileNav.getByRole('link', { name: /^savings$/i }).click();
    await expect(page).toHaveURL(/\/savings$/);
  });
});

// Helper kept for parity with auth.spec (unused here but documents the pattern).
export async function gotoHome(page: Page): Promise<void> {
  await page.goto(CUSTOMER + '/');
}
