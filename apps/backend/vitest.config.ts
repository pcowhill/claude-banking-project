import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Auth/RBAC integration tests share one isolated SQLite test database
    // (created by global-setup via `prisma db push`). Run all backend test files
    // in a single fork, serially, so they never write the shared file
    // concurrently (a shared SQLite file has no cross-process isolation).
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup-env.ts'],
  },
});
