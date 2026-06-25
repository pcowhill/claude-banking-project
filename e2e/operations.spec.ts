import { test, expect, type Page } from '@playwright/test';

const OPERATIONS = 'http://localhost:5174';

// Seeded, NON-SECRET demo operator (see README). The DB is reset+seeded before
// the e2e run (CI: `npm run db:reset`).
const OPS = { email: 'sam.operator@example.com', password: 'Operator123!' };

async function operatorLogin(page: Page): Promise<void> {
  await page.goto(OPERATIONS + '/');
  await page.locator('#email').fill(OPS.email);
  await page.locator('#password').fill(OPS.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('heading', { name: /operations overview/i })).toBeVisible();
}

test.describe('operations simulator core (v0.5.0)', () => {
  test('the dashboard shows a live queue snapshot and recent simulated events', async ({ page }) => {
    await operatorLogin(page);
    // Live overview is present (not the old static placeholders).
    await expect(page.getByRole('heading', { name: /request queue/i })).toBeVisible();
    await expect(page.getByText(/needs attention/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /recent simulated events/i })).toBeVisible();
    // The "Live" real-time indicator connects.
    await expect(page.getByText(/^Live$/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('an operator can action a queue item and it updates live', async ({ page }) => {
    await operatorLogin(page);
    await page.getByRole('link', { name: /request queues/i }).click();
    await expect(page.getByRole('heading', { name: /^request queues$/i })).toBeVisible();

    // Narrow to still-pending work, then act on the first item.
    await page.getByRole('button', { name: /^Pending \(/ }).click();
    const firstCard = page.getByTestId('queue-card').first();
    await expect(firstCard).toBeVisible();
    const summary = (await firstCard.getByTestId('queue-summary').textContent())?.trim() ?? '';
    expect(summary.length).toBeGreaterThan(0);

    await firstCard.getByRole('button', { name: /^approve$/i }).click();

    // Switch to the Approved filter — the actioned item now appears there with an
    // "Approved" badge (proves the state updated without a page reload).
    await page.getByRole('button', { name: /^Approved \(/ }).click();
    const approvedCard = page.getByTestId('queue-card').filter({ hasText: summary });
    await expect(approvedCard).toBeVisible();
    await expect(approvedCard.getByText(/^Approved$/)).toBeVisible();
  });

  test('a simulated external event appears live in the messaging feed', async ({ page }) => {
    await operatorLogin(page);
    // The sidebar link (exact) — not the dashboard "Simulated messaging →" shortcut.
    await page.getByRole('link', { name: 'Simulated messaging', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^simulated messaging$/i })).toBeVisible();
    // Clearly labelled as a simulation — no real provider.
    await expect(page.getByText(/no real sms, email, mfa, or identity provider/i)).toBeVisible();

    // Send a simulated SMS; it shows up in the feed in real time.
    await page
      .getByRole('button', { name: /simulate delivered/i })
      .first()
      .click();
    await expect(page.getByText(/Simulated SMS otp — delivered/i).first()).toBeVisible();
  });
});
