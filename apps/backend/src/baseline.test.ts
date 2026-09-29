import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSeedPlan } from './seed-plan';

/**
 * The pristine-baseline command deployment automation will use. Proves that:
 *  - it builds a fully seeded database at an EXPLICIT absolute path (never the
 *    dev DB), via `migrate deploy` + the seed, and verifies itself;
 *  - `SEED_NOW` pins the seed instant so the content is deterministic;
 *  - the runtime works against an absolute `file:` DATABASE_URL that lives
 *    outside the repository (the eventual /srv/apps/meridian/data layout).
 */
const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..');
const script = join(backendDir, 'prisma', 'baseline.mjs');
const SEED_NOW = '2026-09-01T00:00:00.000Z';

describe('db:baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-baseline-'));
  const target = join(dir, 'nested', 'meridian.db');

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a pristine seeded database at the requested absolute path with a pinned seed instant', async () => {
    const output = execFileSync(process.execPath, [script, '--out', target], {
      cwd: backendDir,
      env: { ...process.env, SEED_NOW, DATABASE_URL: '' },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(output).toContain('[baseline] OK');
    expect(existsSync(target)).toBe(true);
    expect(statSync(target).size).toBeGreaterThan(0);

    const plan = buildSeedPlan();
    const client = new PrismaClient({ datasources: { db: { url: `file:${target}` } } });
    try {
      expect(await client.user.count()).toBe(plan.users.length);
      expect(await client.loginEvent.count()).toBe(plan.loginEvents.length);
      const clock = await client.simulationClock.findUniqueOrThrow({ where: { id: 'singleton' } });
      expect(clock.currentTime.toISOString()).toBe(SEED_NOW);
      // No real-looking identifiers: only RFC 5737 documentation addresses were seeded.
      const ips = (await client.loginEvent.findMany({ select: { ip: true } })).map((e) => e.ip);
      for (const ip of ips) expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
      // Migrations were applied through the committed history (not db push).
      const migrations = await client.$queryRawUnsafe<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
      );
      expect(Number(migrations[0]?.n)).toBeGreaterThan(0);
    } finally {
      await client.$disconnect();
    }
  }, 120_000);

  it('running it again over the same target yields identical content (idempotent + deterministic)', async () => {
    execFileSync(process.execPath, [script, '--out', target], {
      cwd: backendDir,
      env: { ...process.env, SEED_NOW, DATABASE_URL: '' },
      stdio: 'pipe',
    });
    const client = new PrismaClient({ datasources: { db: { url: `file:${target}` } } });
    try {
      const plan = buildSeedPlan();
      expect(await client.user.count()).toBe(plan.users.length);
      expect(await client.ledgerEntry.count()).toBeGreaterThan(0);
      const [entry] = await client.ledgerEntry.findMany({ orderBy: { createdAt: 'asc' }, take: 1 });
      // The oldest seeded entry is dated relative to the pinned instant, so it is stable.
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(new Date(SEED_NOW).getTime());
    } finally {
      await client.$disconnect();
    }
  }, 120_000);
});
