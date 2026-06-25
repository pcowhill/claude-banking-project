import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
