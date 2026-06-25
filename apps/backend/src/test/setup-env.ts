import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs in every test worker BEFORE any test module (so before `src/db.ts`
 * instantiates Prisma). Points the backend at an isolated SQLite test database
 * — never the dev DB — using an absolute path so it is unambiguous regardless
 * of the process working directory.
 */
const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..', '..'); // apps/backend

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${join(backendDir, 'prisma', 'test.db')}`;
