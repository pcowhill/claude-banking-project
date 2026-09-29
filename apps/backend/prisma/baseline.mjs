#!/usr/bin/env node
// Build a PRISTINE, SEEDED SQLite baseline for the public demo (or any fresh
// deployment) — deterministic and safe to run from CI.
//
//   npm run db:baseline                       → apps/backend/prisma/baseline/meridian-baseline.db
//   npm run db:baseline -- --out /abs/path.db → an explicit file (parent dir created)
//   DATABASE_URL=file:/abs/path.db npm run db:baseline
//   SEED_NOW=2026-09-01T00:00:00Z npm run db:baseline   → pinned seed instant (deterministic content)
//
// What it does, in order:
//   1. Resolves the target file (never the development dev.db unless you point it there).
//   2. Deletes any existing file at that path (plus -journal/-wal/-shm side files).
//   3. `prisma migrate deploy` — applies the committed migrations (the same path a
//      production deployment uses; never `migrate dev`, never `db push`).
//   4. `tsx prisma/seed.ts` — writes the demo seed plan (users, accounts, ledger, queue…).
//   5. Verifies the result by opening the file and counting a few tables.
//
// Deployment automation can then copy the file into place (e.g.
// /srv/apps/meridian/data/meridian.db) — the whole database is the unit of
// reset, not just the ledger. SIMULATION: the file holds only fake demo data.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // apps/backend/prisma
const backendDir = join(here, '..');
const repoRoot = join(backendDir, '..', '..');
const prismaBin = join(repoRoot, 'node_modules', '.bin', 'prisma');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

/** Parse `--out <path>` / `--out=<path>` (optional). */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') out.out = argv[++i];
    else if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      out.help = true;
    }
  }
  return out;
}

/** Turn a `file:` URL or a bare path into an absolute filesystem path. */
function toAbsoluteFilePath(input, base) {
  const raw = input.startsWith('file:') ? input.slice('file:'.length) : input;
  return isAbsolute(raw) ? raw : resolve(base, raw);
}

function run(label, command, args, env) {
  console.log(`\n[baseline] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env, cwd: backendDir });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    'Usage: npm run db:baseline [-- --out <file>]\n' +
      '  Target precedence: --out, then DATABASE_URL (file: URL), then apps/backend/prisma/baseline/meridian-baseline.db\n' +
      '  Optional: SEED_NOW=<ISO-8601> pins the seed instant for deterministic content.',
  );
  process.exit(0);
}

let target;
if (args.out) {
  target = toAbsoluteFilePath(args.out, process.cwd());
} else if (process.env.DATABASE_URL) {
  if (!process.env.DATABASE_URL.startsWith('file:')) {
    console.error('DATABASE_URL must be a SQLite file: URL for the baseline build.');
    process.exit(1);
  }
  // A relative file: URL is resolved by Prisma relative to the schema directory.
  target = toAbsoluteFilePath(process.env.DATABASE_URL, here);
} else {
  target = join(here, 'baseline', 'meridian-baseline.db');
}

const databaseUrl = `file:${target}`;
console.log(`[baseline] target database: ${target}`);
if (process.env.SEED_NOW) console.log(`[baseline] pinned seed instant: ${process.env.SEED_NOW}`);

mkdirSync(dirname(target), { recursive: true });
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  const file = target + suffix;
  if (existsSync(file)) rmSync(file);
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
run('applying committed migrations (prisma migrate deploy)', prismaBin, ['migrate', 'deploy'], env);
run('seeding demo data (prisma/seed.ts)', tsxBin, [join(here, 'seed.ts')], env);

// Verify by opening the produced file with the generated Prisma client.
const { PrismaClient } = await import('@prisma/client');
const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
try {
  const [users, accounts, entries, clock] = await Promise.all([
    client.user.count(),
    client.account.count(),
    client.ledgerEntry.count(),
    client.simulationClock.findUnique({ where: { id: 'singleton' } }),
  ]);
  if (users === 0 || accounts === 0 || entries === 0 || !clock) {
    throw new Error('Baseline verification failed: the seeded database is missing core rows.');
  }
  const bytes = statSync(target).size;
  console.log(
    `\n[baseline] OK — ${users} users, ${accounts} accounts, ${entries} ledger entries, ` +
      `clock at ${clock.currentTime.toISOString()}, ${bytes} bytes\n[baseline] ${target}`,
  );
} finally {
  await client.$disconnect();
}
