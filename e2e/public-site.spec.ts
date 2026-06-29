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
    // v1.0.0: cards shipped (v0.8.0) — the page presents them as a live, clearly
    // simulated feature, no longer "coming soon".
    await expect(page.getByRole('heading', { name: /cards, with controls/i })).toBeVisible();

    await nav.getByRole('link', { name: /loans & cds/i }).click();
    await expect(page).toHaveURL(/\/borrow$/);
    // v1.0.0: lending shipped — the page is live, not "coming soon".
    await expect(page.getByRole('heading', { name: /borrow and save over simulated time/i })).toBeVisible();

    await nav.getByRole('link', { name: /^about$/i }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { name: /a bank you can read like a book/i })).toBeVisible();
  });

  test('the cards & lending pages present shipped features and stay clearly simulated (v1.0.0)', async ({
    page,
  }) => {
    // Cards shipped in v0.8.0: the page is live (managed in the portal wallet),
    // explicitly simulated, with no "coming soon" / milestone-tag framing.
    await page.goto(CUSTOMER + '/cards');
    await expect(page.getByRole('heading', { name: /cards, with controls/i })).toBeVisible();
    await expect(page.getByText(/live in the portal today/i)).toBeVisible();
    await expect(page.getByText(/simulated cards/i).first()).toBeVisible();
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);

    // Lending shipped in v1.0.0: the page is live and shows the real simulated
    // rate tables the portal actually offers.
    await page.goto(CUSTOMER + '/borrow');
    await expect(page.getByRole('heading', { name: /borrow and save over simulated time/i })).toBeVisible();
    await expect(page.getByText(/clearly simulated/i).first()).toBeVisible();
    await expect(page.getByText(/certificate of deposit rates/i)).toBeVisible();
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);
  });

  test('the open-account page is a real, clearly-simulated application that links to login', async ({
    page,
  }) => {
    await page.goto(CUSTOMER + '/open-account');
    // v0.6.0: the placeholder is now a working, clearly-simulated application form.
    await expect(page.getByRole('heading', { name: /open a simulated account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /submit simulated application/i })).toBeVisible();
    // It still offers a path to the working sign-in.
    await page.getByRole('link', { name: /^sign in$/i }).first().click();
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
