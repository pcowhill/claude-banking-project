import { PrismaClient } from '@prisma/client';

/**
 * Prisma client + database helpers.
 *
 * Prisma resolves a relative SQLite `file:` path relative to the schema
 * directory (apps/backend/prisma) for BOTH the CLI and the generated client, so
 * `file:./dev.db` always points at apps/backend/prisma/dev.db regardless of the
 * process working directory. This matches the path the Prisma CLI manages.
 * Override with an absolute `file:` URL via DATABASE_URL for custom setups.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

export const prisma = new PrismaClient();

export interface DatabaseStatus {
  connected: boolean;
  users: number;
  accounts: number;
}

/** Cheap readiness probe used by GET /status. Never throws. */
export async function checkDatabase(): Promise<DatabaseStatus> {
  try {
    const [users, accounts] = await Promise.all([prisma.user.count(), prisma.account.count()]);
    return { connected: true, users, accounts };
  } catch {
    return { connected: false, users: 0, accounts: 0 };
  }
}
