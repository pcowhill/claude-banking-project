import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for v1.0.0 — loans, CDs & clock-driven interest accrual.
 * Everything is a local SIMULATION. The DB is reset+seeded before the run, so the
 * clock starts at seed time and Avery already owns a seeded 6-month CD ($2,000)
 * and a personal loan ($6,000 owed); savings accrues 1.50% APY on each advance.
 *
 * The correctness of accrual + money discipline is covered exhaustively by the
 * backend integration tests (apps/backend/src/routes/lending.test.ts and the
 * clock tests); these journeys prove the v1.0.0 UIs are wired up: a customer
 * opens a CD on /loans and sees it listed, and an operator advances the clock and
 * sees the interest-accrual summary.
 *
 * NOTE ON THE SHARED CLOCK: the simulation clock is a single forward-only global
 * resource, and Playwright runs specs in parallel. This spec therefore asserts on
 * accrual in an ORDER-INDEPENDENT way (interest accrues on any advance that crosses
 * a monthly anniversary, and keeps accruing via compounding on later advances), so
 * it stays green regardless of whether scheduled-payments.spec.ts has already
 * stepped the clock.
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

test.describe('loans, CDs & interest accrual (v1.0.0)', () => {
  test('the customer lending portal lists the seeded CD and loan, and the simulated date', async ({
    page,
  }) => {
    await customerLogin(page, AVERY.email, AVERY.password);

    // Go to the lending portal. (The marketing nav also has a "Loans & CDs" link
    // → /borrow, so navigate directly rather than by ambiguous link text.)
    await page.goto(CUSTOMER + '/loans');
    await expect(page).toHaveURL(/\/loans$/);
    // The page H1 (distinct from the "Your loans & CDs" section H2).
    await expect(page.getByRole('heading', { name: 'Loans & CDs', exact: true })).toBeVisible();

    // The clock-driven framing: the current simulated date is shown.
    await expect(page.getByText(/current simulated date/i)).toBeVisible();

    // The seeded products are listed: the CD (kind label + its account name) and
    // the loan (with an amount owed).
    await expect(page.getByText('Certificate of Deposit').first()).toBeVisible();
    await expect(page.getByText('6-month CD')).toBeVisible();
    await expect(page.getByText('Personal loan')).toBeVisible();
    await expect(page.getByText(/you owe/i)).toBeVisible();
  });

  test('a customer opens a new CD and sees it listed', async ({ page }) => {
    await customerLogin(page, AVERY.email, AVERY.password);
    await page.goto(CUSTOMER + '/loans');
    await expect(page.getByRole('heading', { name: 'Loans & CDs', exact: true })).toBeVisible();

    // Open a 12-month CD funded from a cash account.
    await page.locator('#cd-funding').selectOption({ index: 1 });
    await page.locator('#cd-amount').fill('500');
    await page.locator('#cd-term').selectOption('12');

    // The live maturity projection appears before submit (pure shared math).
    await expect(page.getByText(/projected to be worth/i)).toBeVisible();

    await page.getByRole('button', { name: /^open cd$/i }).click();

    // A confirmation appears (role=status), and the new 12-month CD now shows in
    // the products list. Its offered 12-month APY (4.50%) is distinct from the
    // seeded 6-month CD's 3.50%, so its presence is unambiguous.
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByText(/4\.50% apy/i).first()).toBeVisible();
    // Its $500.00 principal is shown on the new card.
    await expect(page.getByText('$500.00').first()).toBeVisible();
  });

  test('an operator advances the clock and sees the interest-accrual summary', async ({ page }) => {
    await operatorLogin(page, OPS.email, OPS.password);

    await page.getByRole('link', { name: /simulation clock/i }).click();
    await expect(page.getByRole('heading', { name: /^simulation clock$/i })).toBeVisible();

    // Advance well past a monthly anniversary (62 days guarantees a month crosses
    // from ANY start day-of-month, while staying under the 6-month CD maturity so
    // the CD keeps accruing rather than maturing). Use the custom days field.
    await page.locator('#ff-days').fill('62');
    await page.getByRole('button', { name: /advance clock/i }).click();

    // The "Last advance" panel renders, and the v1.0.0 interest-accrual summary
    // appears beneath it.
    await expect(page.getByText(/last advance/i)).toBeVisible();
    await expect(page.getByText(/interest accrued/i)).toBeVisible();

    // Savings + the seeded CD + the seeded loan all accrue over a 2-month jump, so
    // the summary shows a positive credited amount and a positive charged amount.
    // (Order-independent: compounding means later advances still accrue.)
    await expect(page.getByText(/credited \$/i)).toBeVisible();
    await expect(page.getByText(/charged \$/i)).toBeVisible();
    // At least one savings account, CD, and loan are reported as accrued.
    await expect(page.getByText(/savings account/i)).toBeVisible();
  });

  test('a customer sees savings interest posted after the clock advances', async ({ page }) => {
    // By the time this runs the operator/other specs have advanced the clock past
    // at least one monthly anniversary, so the savings account carries a posted
    // "Interest earned (simulated)" entry. We advance once more from the operator
    // side to guarantee accrual independent of test ordering, then read it as the
    // customer.
    const operator = await page.context().newPage();
    try {
      await operatorLogin(operator, OPS.email, OPS.password);
      await operator.getByRole('link', { name: /simulation clock/i }).click();
      await operator.locator('#ff-days').fill('40');
      await operator.getByRole('button', { name: /advance clock/i }).click();
      await expect(operator.getByText(/interest accrued/i)).toBeVisible();
    } finally {
      await operator.close();
    }

    await customerLogin(page, AVERY.email, AVERY.password);
    await page.getByRole('link', { name: /goal savings/i }).click();
    await expect(page).toHaveURL(/\/accounts\/[^/]+$/);

    // The savings ledger now shows a simulated interest credit (Interest category).
    await expect(page.getByText(/interest earned \(simulated\)/i).first()).toBeVisible();
  });
});
