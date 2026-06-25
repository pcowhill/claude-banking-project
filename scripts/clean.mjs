#!/usr/bin/env node
// Cross-platform clean: removes build artifacts, generated code, local test
// databases, and tooling caches. Safe to run on Windows PowerShell, WSL, macOS,
// and Linux because it uses Node's fs API instead of shell-specific commands.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const targets = [
  'apps/backend/dist',
  'apps/backend/src/generated',
  'apps/backend/prisma/dev.db',
  'apps/backend/prisma/dev.db-journal',
  'apps/customer/dist',
  'apps/operations/dist',
  'packages/shared/dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.eslintcache',
];

for (const target of targets) {
  const full = join(root, target);
  try {
    await rm(full, { recursive: true, force: true });
    console.log(`removed ${target}`);
  } catch (err) {
    console.warn(`skip ${target}: ${err.message}`);
  }
}

console.log('clean complete. Run `npm run db:reset` before starting the app again.');
