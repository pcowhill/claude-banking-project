import { defineConfig } from 'vitest/config';

// Deployment-pipeline tests (scripts/deploy/test). They drive the real shell
// scripts against temporary directories with fake ssh / service helper /
// public verifier fixtures — never a real server.
export default defineConfig({
  test: {
    name: 'deploy',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
