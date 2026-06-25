// Playwright end-to-end / smoke configuration.
//
// For v0.1.0 these are intentionally shallow "does it load and is it clearly a
// simulation?" smoke checks for both frontend apps. They are NOT part of the
// fast `npm run verify` gate (which stays lint + typecheck + unit + build);
// run them with `npm run test:e2e`. CI runs them as a separate job.
//
// The Chromium browser is expected to be pre-installed. In CI / fresh machines
// run `npm run test:e2e:install` first.
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

// Optional escape hatch: point at a pre-installed Chromium (e.g. in a sandbox
// where the browser cannot be downloaded). No effect for normal local/CI runs,
// which use the browser installed by `npx playwright install`.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],

  // Start the full local stack. The backend /health endpoint never touches the
  // database, so it becomes ready quickly; the apps degrade gracefully if the
  // API is not reachable.
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:customer',
      url: 'http://localhost:5173',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:operations',
      url: 'http://localhost:5174',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
