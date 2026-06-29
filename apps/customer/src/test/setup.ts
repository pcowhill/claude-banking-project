// Vitest setup for the customer app's component tests (Q-01). Registers the
// jest-dom matchers (e.g. toBeInTheDocument, toBeVisible) on Vitest's `expect`
// and cleans up the rendered DOM after each test so component tests stay
// isolated. Imported via `setupFiles` in vitest.config.ts.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
