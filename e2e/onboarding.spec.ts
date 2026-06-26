import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for v0.6.0 — onboarding & account opening, plus the two
 * v0.5.0 review fixes (B-01 detail-panel buttons sync to live state; B-02 add a
 * note after the decision). Everything is a local SIMULATION. The DB is
 * reset+seeded before the e2e run (CI: `npm run db:reset`).
 */

const CUSTOMER = 'http://localhost:5173';
const OPERATIONS = 'http://localhost:5174';
const API = 'http://localhost:3000';

const OPS = { email: 'sam.operator@example.com', password: 'Operator123!' };
const ADMIN = { email: 'riley.admin@example.com', password: 'Admin123!' };
const JOINT = { email: 'jordan.joint@example.com', password: 'Joint123!' };

async function operatorLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(OPERATIONS + '/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('heading', { name: /operations overview/i })).toBeVisible();
}

async function customerLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(CUSTOMER + '/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('onboarding & account opening (v0.6.0)', () => {
  test('a visitor can submit a simulated open-account application', async ({ page }) => {
    const email = `e2e-apply-${Date.now()}@example.com`;
    await page.goto(CUSTOMER + '/open-account');
    await expect(page.getByRole('heading', { name: /open a simulated account/i })).toBeVisible();

    await page.locator('#fullName').fill('E2E Applicant');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('Applicant123!');
    // Checking is the default product; set a small opening deposit.
    await page.locator('#deposit').fill('100');
    await page.getByRole('checkbox').check(); // consent
    await page.getByRole('button', { name: /submit simulated application/i }).click();

    // Confirmation panel with a reference; no account exists until an operator approves.
    await expect(page.getByRole('heading', { name: /application received \(simulated\)/i })).toBeVisible();
    await expect(page.getByText(/MER-/)).toBeVisible();
  });

  test('an operator sees onboarding context, approves it (B-01), and can note after (B-02)', async ({
    page,
    request,
  }) => {
    // Own the scenario: submit a fresh application via the public API so this test
    // never races another over a shared seeded item.
    const applicant = `E2E Review ${Date.now()}`;
    const email = `e2e-review-${Date.now()}@example.com`;
    const submit = await request.post(`${API}/api/onboarding/applications`, {
      data: {
        fullName: applicant,
        email,
        password: 'Applicant123!',
        product: 'checking',
        initialFundingMinor: 12_300,
        consent: true,
      },
    });
    expect(submit.ok()).toBeTruthy();

    await operatorLogin(page, OPS.email, OPS.password);
    await page.getByRole('link', { name: /request queues/i }).click();
    await expect(page.getByRole('heading', { name: /^request queues$/i })).toBeVisible();

    // Find our application by its unique applicant name and open its detail.
    const card = page.getByTestId('queue-card').filter({ hasText: applicant });
    await expect(card).toBeVisible();
    await card.getByTestId('queue-summary').click();

    // N-11a: the detail panel shows the onboarding application context.
    await expect(page.getByText('Opening deposit:')).toBeVisible();
    await expect(page.getByText(/Approving provisions the account/i)).toBeVisible();

    // B-01: not resolved yet. Approve from the LEFT card; the open detail panel
    // reacts to the live state (its "Resolved — you can still add a note" hint,
    // shown only for a terminal request, appears).
    await expect(page.getByText(/Resolved — you can still add an audit note/i)).toHaveCount(0);
    await card.getByRole('button', { name: /^approve$/i }).click();
    await expect(page.getByText(/Resolved — you can still add an audit note/i)).toBeVisible();

    // B-02: add a note AFTER the decision — it lands in the History trail.
    await page.locator('#ops-note').fill('E2E post-decision note');
    await page.getByRole('button', { name: /^add note$/i }).click();
    await expect(page.getByText('E2E post-decision note')).toBeVisible();
  });

  test('the admin-only Create demo user page is available to an admin', async ({ page }) => {
    await operatorLogin(page, ADMIN.email, ADMIN.password);
    const link = page.getByRole('link', { name: /create demo user/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByRole('heading', { name: /create demo user/i })).toBeVisible();
    await expect(page.locator('#admin-email')).toBeVisible();
  });

  test('a non-admin operator does not see the admin Create demo user link', async ({ page }) => {
    await operatorLogin(page, OPS.email, OPS.password);
    await expect(page.getByRole('link', { name: /create demo user/i })).toHaveCount(0);
  });

  test('a customer sees a pending joint-owner invitation in their inbox', async ({ page }) => {
    // The seed includes a PENDING Avery → Jordan invitation to Goal Savings.
    await customerLogin(page, JOINT.email, JOINT.password);
    await expect(page.getByRole('heading', { name: /^invitations$/i })).toBeVisible();
    const invite = page.getByRole('listitem').filter({ hasText: /Goal Savings/i });
    await expect(invite).toBeVisible();
    await expect(invite.getByRole('button', { name: /^accept$/i })).toBeVisible();
    await expect(invite.getByRole('button', { name: /^decline$/i })).toBeVisible();
  });
});
