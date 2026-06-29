import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest config for the customer app (Q-01). The bulk of the customer tests are
 * pure helpers that need no DOM, but this enables the project's FIRST real
 * component tests too: jsdom + Testing Library, with a setup file that registers
 * the `@testing-library/jest-dom` matchers. The React plugin transpiles the
 * TSX/JSX (and the `@simbank/shared` workspace, which resolves to TS source).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'customer',
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // jsdom is only needed by component tests; the pure-helper tests ignore it.
    css: false,
  },
});
