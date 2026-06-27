import { prisma } from '../src/db';
import { applySeedPlan } from '../src/seed-apply';
import { buildSeedPlan } from '../src/seed-plan';

/**
 * Write the demo seed data into SQLite. Run via `npm run db:seed` (or
 * automatically by `npm run db:reset`). The actual write logic lives in
 * `src/seed-apply.ts` so the seed script and the test fixtures share one path;
 * it re-checks the money + access invariants and fails loud on any violation.
 *
 * SIMULATION: demo users carry a bcrypt hash of a NON-SECRET demo password; the
 * plaintext lives only in the seed plan and is never persisted.
 */
async function main(): Promise<void> {
  const result = await applySeedPlan(prisma, buildSeedPlan());
  console.log(
    `Seed complete (SIMULATION — not real money): ${result.users} users, ` +
      `${result.accounts} accounts, ${result.entries} ledger entries, ${result.grants} access grants, ` +
      `${result.opsRequests} ops requests, ${result.simulatedEvents} simulated events, ` +
      `${result.onboardingApplications} onboarding applications, ${result.invitations} invitations, ${result.cards} cards, ` +
      `${result.schedules} scheduled payments.`,
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
