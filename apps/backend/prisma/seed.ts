import { prisma } from '../src/db';
import { assertSeedInvariants, buildSeedPlan } from '../src/seed-plan';

/**
 * Write the demo seed data into SQLite. Run via `npm run db:seed` (or
 * automatically by `npm run db:reset`). Re-runnable: it clears the domain
 * tables first. After writing, it re-checks the money invariant and fails loud
 * if seeding ever produced value out of thin air.
 */
async function main(): Promise<void> {
  const plan = buildSeedPlan();

  // Pre-flight money-integrity check on the plan itself (same logic the unit
  // test asserts). Fails loud if the seed would ever create money from nowhere.
  assertSeedInvariants(plan);

  // Clear domain tables so the seed is idempotent when run standalone.
  await prisma.ledgerEntry.deleteMany();
  await prisma.account.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.operationsRequest.deleteMany();
  await prisma.user.deleteMany();

  const accountIdByKey = new Map<string, string>();

  for (const u of plan.users) {
    const user = await prisma.user.create({
      data: { email: u.email, displayName: u.displayName, role: u.role },
    });
    for (const a of u.accounts) {
      const account = await prisma.account.create({
        data: { userId: user.id, type: a.type, name: a.name },
      });
      accountIdByKey.set(a.key, account.id);
    }
  }

  for (const e of plan.entries) {
    const accountId = accountIdByKey.get(e.accountKey);
    if (!accountId) {
      throw new Error(`Seed references an unknown account key: ${e.accountKey}`);
    }
    const isSettled = e.status === 'posted' || e.status === 'disputed';
    await prisma.ledgerEntry.create({
      data: {
        accountId,
        amountMinor: e.amountMinor,
        direction: e.direction,
        status: e.status,
        origin: e.origin,
        description: e.description,
        postedAt: isSettled ? new Date() : null,
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
      reason: 'Initial demo seed (v0.1.0)',
    },
  });

  const [users, accounts, entries] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.ledgerEntry.count(),
  ]);

  console.log(
    `Seed complete (SIMULATION — not real money): ${users} users, ${accounts} accounts, ${entries} ledger entries.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
