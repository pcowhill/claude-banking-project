import { test, expect } from '@playwright/test';

const CUSTOMER = 'http://localhost:5173';
const OPERATIONS = 'http://localhost:5174';

const DEMO = {
  customer: { email: 'avery.customer@example.com', password: 'Customer123!' },
  ops: { email: 'sam.operator@example.com', password: 'Operator123!' },
};

/**
 * Browser-level regression for the v0.2.0 cross-app session-bleed bug (v0.3.0
 * task W-00). Both apps run on localhost (different ports) and share one backend,
 * and browser cookies are not isolated by port — so this drives BOTH apps inside
 * ONE browser context (one shared cookie jar), exactly as two real tabs would.
 *
 * Before the fix, logging out of the customer portal left the operator/admin
 * "showing through" on /dashboard. After the fix, the customer portal redirects
 * to its own login while the operations session keeps working independently.
 */
test('an operations login never bleeds into the customer portal', async ({ browser }) => {
  const context = await browser.newContext();
  const customer = await context.newPage();
  const ops = await context.newPage();

  // 1. Customer signs in on the portal.
  await customer.goto(CUSTOMER + '/login');
  await customer.locator('#email').fill(DEMO.customer.email);
  await customer.locator('#password').fill(DEMO.customer.password);
  await customer.getByRole('button', { name: /continue/i }).click();
  await expect(customer).toHaveURL(/\/dashboard$/);
  await expect(customer.getByRole('heading', { name: /welcome back, avery/i })).toBeVisible();

  // 2. Operator signs in on the console (same browser, second tab).
  await ops.goto(OPERATIONS + '/');
  await ops.locator('#email').fill(DEMO.ops.email);
  await ops.locator('#password').fill(DEMO.ops.password);
  await ops.getByRole('button', { name: /^sign in$/i }).click();
  await expect(ops.getByRole('heading', { name: /operations overview/i })).toBeVisible();

  // 3. Reloading the customer dashboard still shows the CUSTOMER (no bleed-through).
  await customer.goto(CUSTOMER + '/dashboard');
  await expect(customer.getByRole('heading', { name: /welcome back, avery/i })).toBeVisible();

  // 4. The customer logs out of the portal. Wait for the logged-out header to
  //    appear so the logout request has fully completed before we navigate
  //    (otherwise the next goto can abort the in-flight logout).
  await customer.getByRole('button', { name: /log out/i }).click();
  await expect(
    customer.getByRole('banner').getByRole('button', { name: /^log in$/i }),
  ).toBeVisible();

  // 5. ...and visiting /dashboard now redirects to the CUSTOMER login (the fix).
  await customer.goto(CUSTOMER + '/dashboard');
  await expect(customer).toHaveURL(/\/login$/);
  await expect(customer.getByRole('heading', { name: /log in to meridian/i })).toBeVisible();

  // 6. The operations console session is untouched and still works.
  await ops.goto(OPERATIONS + '/');
  await expect(ops.getByRole('heading', { name: /operations overview/i })).toBeVisible();

  await context.close();
});
