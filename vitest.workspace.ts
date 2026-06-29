// Root Vitest workspace. Unit/integration tests live next to the code they
// cover. The tested core is the shared package (pure logic such as ledger +
// lending math) and the backend (API + seed via app.inject()). v1.0.0 adds the
// project's first FRONTEND tests in the customer app (Q-01): pure presentational
// helpers plus a jsdom + Testing Library component test (see
// apps/customer/vitest.config.ts). The frontend apps are still ALSO exercised by
// the Playwright smoke/journey tests (see playwright.config.ts).
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared',
  'apps/backend',
  'apps/customer',
]);
