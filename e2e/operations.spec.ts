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

test.describe('operations console fixes (v0.6.1)', () => {
  // B-04: when the backend rejects the operator session (expired / missing cookie /
  // stale session from an earlier version), the console must NOT strand the
  // operator on an authenticated-looking page whose data calls all fail with
  // "Not authenticated". It should return them to the sign-in screen and recover.
  test('an expired/rejected ops session returns the operator to sign-in (no dead "Not authenticated")', async ({
    page,
  }) => {
    await operatorLogin(page);

    // Simulate the backend rejecting the session for every ops data call.
    // (auth + socket.io are left alone, so /api/auth/me still restores the user.)
    await page.route('**/api/ops/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated.', code: 'unauthenticated' }),
      }),
    );
    await page.reload({ waitUntil: 'networkidle' });

    // Bounced back to the operator sign-in screen, with a clear explanation —
    // not a dead error inside the console.
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/session has ended/i)).toBeVisible();
    await expect(page.getByText(/^Not authenticated\.?$/)).toHaveCount(0);

    // Recovery: with a real session again, signing in reaches the live queue.
    await page.unroute('**/api/ops/**');
    await page.locator('#email').fill(OPS.email);
    await page.locator('#password').fill(OPS.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByRole('heading', { name: /operations overview/i })).toBeVisible();
    await page.getByRole('link', { name: /request queues/i }).click();
    await expect(page.getByTestId('queue-card').first()).toBeVisible({ timeout: 10_000 });
  });
});

// B-03: on a narrow window the left sidebar is hidden; navigation must still be
// reachable via a menu toggle so the operator can switch sections.
test.describe('operations console navigation on a narrow window (v0.6.1)', () => {
  test.use({ viewport: { width: 600, height: 800 } });

  test('the menu toggle reveals navigation and can switch sections', async ({ page }) => {
    await operatorLogin(page);

    // The desktop sidebar links are not reachable at this width…
    await expect(page.getByRole('link', { name: /request queues/i })).toBeHidden();

    // …but a menu toggle is, and it reveals the same navigation.
    const toggle = page.getByRole('button', { name: /open navigation menu/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    await page.getByRole('link', { name: /request queues/i }).click();
    await expect(page.getByRole('heading', { name: /^request queues$/i })).toBeVisible();

    // The menu auto-closes after navigating (the link is hidden again).
    await expect(page.getByRole('link', { name: /request queues/i })).toBeHidden();
  });
});
