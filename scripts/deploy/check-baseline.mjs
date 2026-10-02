#!/usr/bin/env node
// Verify a release's pristine baseline database THROUGH THE RELEASE'S OWN
// Prisma client (release/node_modules), so the check also proves the packaged
// generated client + query engine can open the packaged database.
//
//   node scripts/deploy/check-baseline.mjs --release <dir> --seed-now <iso>
//
// The baseline itself is never opened: it is copied to a temporary file first,
// so the shipped bytes stay exactly as `npm run db:baseline` wrote them.
import {
  copyFileSync,
  mkdtempSync,
  openSync,
  readSync,
  closeSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The seeded showcase logins documented in the README (apps/backend/src/seed-plan.ts).
const SHOWCASE_USERS = {
  'avery.customer@example.com': 'customer',
  'jordan.joint@example.com': 'joint_customer',
  'sam.operator@example.com': 'ops_agent',
  'riley.admin@example.com': 'admin',
};

function fail(message) {
  console.error(`[check-baseline] ERROR: ${message}`);
  process.exit(1);
}

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--release') args.release = argv[++i];
  else if (argv[i] === '--seed-now') args.seedNow = argv[++i];
  else fail(`unknown argument ${argv[i]}`);
}
if (!args.release || !args.seedNow)
  fail('usage: check-baseline.mjs --release <dir> --seed-now <iso>');
const release = resolve(args.release);
const expectedSeed = new Date(args.seedNow);
if (Number.isNaN(expectedSeed.getTime()))
  fail(`--seed-now is not a valid instant: ${args.seedNow}`);

const baseline = join(release, 'baseline', 'meridian-baseline.db');
const st = statSync(baseline, { throwIfNoEntry: false });
if (!st || !st.isFile()) fail(`${baseline} is missing or not a regular file`);
if (st.size === 0) fail(`${baseline} is empty`);
const header = Buffer.alloc(16);
const fd = openSync(baseline, 'r');
readSync(fd, header, 0, 16, 0);
closeSync(fd);
if (header.toString('latin1') !== 'SQLite format 3\u0000')
  fail(`${baseline} does not start with the SQLite header`);

// Resolve @prisma/client exactly as release/backend/index.js would.
const requireFromRelease = createRequire(join(release, 'backend', 'index.js'));
const clientPath = requireFromRelease.resolve('@prisma/client');
if (!clientPath.startsWith(join(release, 'node_modules') + '/')) {
  fail(`@prisma/client resolved outside the release: ${clientPath}`);
}
const { PrismaClient } = requireFromRelease('@prisma/client');

const scratch = mkdtempSync(join(tmpdir(), 'meridian-baseline-check-'));
const copy = join(scratch, 'meridian.db');
copyFileSync(baseline, copy);
const prisma = new PrismaClient({ datasources: { db: { url: `file:${copy}` } } });
try {
  const [users, accounts, entries, sessions, clock, migrations, failedMigrations] =
    await Promise.all([
      prisma.user.findMany({ select: { email: true, role: true, status: true } }),
      prisma.account.count(),
      prisma.ledgerEntry.count(),
      prisma.session.count(),
      prisma.simulationClock.findUnique({ where: { id: 'singleton' } }),
      prisma.$queryRawUnsafe(
        'SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
      ),
      prisma.$queryRawUnsafe(
        'SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL',
      ),
    ]);
  const byEmail = new Map(users.map((u) => [u.email, u]));
  for (const [email, role] of Object.entries(SHOWCASE_USERS)) {
    const user = byEmail.get(email);
    if (!user) fail(`seeded showcase user ${email} is missing`);
    if (user.role !== role) fail(`seeded user ${email} has role ${user.role}, expected ${role}`);
    if (user.status !== 'active') fail(`seeded user ${email} is not active`);
  }
  if (accounts === 0) fail('no accounts were seeded');
  if (entries === 0) fail('no ledger entries were seeded');
  if (sessions !== 0) fail(`a pristine baseline must hold no sessions (found ${sessions})`);
  if (!clock) fail('the simulation clock singleton is missing');
  if (clock.currentTime.getTime() !== expectedSeed.getTime()) {
    fail(
      `simulation clock is ${clock.currentTime.toISOString()}, expected SEED_NOW ${expectedSeed.toISOString()}`,
    );
  }
  if (Number(migrations[0]?.n) === 0) fail('no applied migrations recorded');
  if (Number(failedMigrations[0]?.n) !== 0)
    fail('the baseline records unfinished or rolled-back migrations');
  console.log(
    `[check-baseline] OK — ${users.length} users (showcase logins present), ${accounts} accounts, ` +
      `${entries} ledger entries, 0 sessions, ${Number(migrations[0].n)} migrations, ` +
      `clock ${clock.currentTime.toISOString()}, ${st.size} bytes; opened with ${clientPath.slice(release.length + 1)}`,
  );
} finally {
  await prisma.$disconnect();
  rmSync(scratch, { recursive: true, force: true });
}
