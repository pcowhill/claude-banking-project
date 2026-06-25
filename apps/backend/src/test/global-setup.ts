import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vitest global setup (runs once, before any worker). Creates a fresh, isolated
 * SQLite test database from the Prisma schema via `prisma db push`, and removes
 * it on teardown. Using `db push` (not migrate) keeps the test DB independent of
 * migration history and fast to (re)create.
 *
 * Engine resolution: on a normal machine / CI the Prisma engines are present
 * from `npm install`; in the proxy-restricted sandbox they are resolved via the
 * PRISMA_* env vars already in the environment. Either way this needs no code
 * change.
 */
const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..', '..'); // apps/backend
const repoRoot = join(backendDir, '..', '..');
const schemaPath = join(backendDir, 'prisma', 'schema.prisma');
const dbFile = join(backendDir, 'prisma', 'test.db');
const dbUrl = `file:${dbFile}`;
const prismaBin = join(repoRoot, 'node_modules', '.bin', 'prisma');

function removeDb(): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = dbFile + suffix;
    if (existsSync(file)) rmSync(file);
  }
}

export default function setup(): () => void {
  removeDb();
  execSync(
    `"${prismaBin}" db push --schema "${schemaPath}" --skip-generate --accept-data-loss --force-reset`,
    {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    },
  );
  return () => removeDb();
}
