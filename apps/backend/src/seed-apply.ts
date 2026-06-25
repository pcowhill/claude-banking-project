import type { PrismaClient } from '@prisma/client';
import { hashPassword } from './auth/password';
import { assertSeedAccessIntegrity, assertSeedInvariants, type SeedPlan } from './seed-plan';

/**
 * Apply a seed PLAN to the database. Extracted from the seed script so the exact
 * same path (hash passwords, create users/accounts, write owner + joint access
 * grants, post ledger entries) is reused by `prisma/seed.ts` AND the test
 * fixtures — tests therefore exercise the real seeding, not a parallel copy.
 *
 * Re-runnable: it clears the domain tables first (children before parents).
 */
export interface SeedResult {
  users: number;
  accounts: number;
  entries: number;
  grants: number;
}

export async function applySeedPlan(
  prisma: PrismaClient,
  plan: SeedPlan,
  now: Date = new Date(),
): Promise<SeedResult> {
  assertSeedInvariants(plan);
  assertSeedAccessIntegrity(plan);

  await prisma.loginEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.accountAccess.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.account.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.operationsRequest.deleteMany();
  await prisma.user.deleteMany();

  const userIdByEmail = new Map<string, string>();
  const accountIdByKey = new Map<string, string>();

  for (const u of plan.users) {
    const passwordHash = await hashPassword(u.password);
    const user = await prisma.user.create({
      data: {
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        status: 'active',
        passwordHash,
        passwordUpdatedAt: now,
      },
    });
    userIdByEmail.set(u.email.toLowerCase(), user.id);

    for (const a of u.accounts) {
      const account = await prisma.account.create({
        data: { userId: user.id, type: a.type, name: a.name },
      });
      accountIdByKey.set(a.key, account.id);
      await prisma.accountAccess.create({
        data: { userId: user.id, accountId: account.id, relationship: 'owner' },
      });
    }
  }

  for (const grant of plan.access) {
    const userId = userIdByEmail.get(grant.userEmail.toLowerCase());
    const accountId = accountIdByKey.get(grant.accountKey);
    if (!userId) throw new Error(`Seed references an unknown user email: ${grant.userEmail}`);
    if (!accountId) throw new Error(`Seed references an unknown account key: ${grant.accountKey}`);
    await prisma.accountAccess.create({
      data: { userId, accountId, relationship: grant.relationship },
    });
  }

  for (const e of plan.entries) {
    const accountId = accountIdByKey.get(e.accountKey);
    if (!accountId) throw new Error(`Seed references an unknown account key: ${e.accountKey}`);
    const isSettled = e.status === 'posted' || e.status === 'disputed';
    await prisma.ledgerEntry.create({
      data: {
        accountId,
        amountMinor: e.amountMinor,
        direction: e.direction,
        status: e.status,
        origin: e.origin,
        description: e.description,
        postedAt: isSettled ? now : null,
      },
    });
  }

  await prisma.simulationClock.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  await prisma.auditLog.create({
    data: {
      actorRole: 'admin',
      action: 'seed_database',
      entity: 'system',
      reason: 'Demo seed (v0.2.0: demo users, hashed passwords, access grants)',
    },
  });

  const [users, accounts, entries, grants] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.ledgerEntry.count(),
    prisma.accountAccess.count(),
  ]);
  return { users, accounts, entries, grants };
}
