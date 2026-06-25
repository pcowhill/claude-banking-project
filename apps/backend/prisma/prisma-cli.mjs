#!/usr/bin/env node
// Cross-platform Prisma CLI wrapper.
//
// Why this exists: we deliberately do NOT commit a `.env` file. This wrapper
// supplies a deterministic local SQLite DATABASE_URL to the Prisma CLI so the
// same command works identically on Windows PowerShell, WSL Ubuntu, macOS and
// Linux without per-shell env-var syntax differences.
//
// The relative URL `file:./dev.db` is resolved by Prisma relative to this
// schema directory (apps/backend/prisma), so the database file always lands at
// apps/backend/prisma/dev.db. The runtime client (src/db.ts) targets the same
// file via a cwd-relative path. Override by exporting DATABASE_URL yourself
// (use an absolute `file:` URL to stay unambiguous across CLI and runtime).
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const args = process.argv.slice(2);
const result = spawnSync('prisma', args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (result.error) {
  console.error('Failed to run prisma CLI:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
