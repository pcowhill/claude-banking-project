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
 *
 * DETERMINISM: every seeded timestamp (ledger history, clock start, maturities,
 * schedule due dates, sign-in history) is derived from ONE "seed instant". By
 * default that is the wall-clock time of the run; set `SEED_NOW` to an ISO-8601
 * instant (e.g. `SEED_NOW=2026-09-01T00:00:00Z`) to pin it, which is what the
 * public-demo baseline build does so every generated baseline carries the
 * identical data. (Row ids and bcrypt salts are still random by design — the
 * CONTENT is what is deterministic, not the bytes of the file.)
 */
function seedInstant(): Date {
  const raw = process.env.SEED_NOW;
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`SEED_NOW is not a valid ISO-8601 instant: ${raw}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const now = seedInstant();
  if (process.env.SEED_NOW) console.log(`Seeding with pinned seed instant ${now.toISOString()} (SEED_NOW).`);
  const result = await applySeedPlan(prisma, buildSeedPlan(), now);
  console.log(
    `Seed complete (SIMULATION — not real money): ${result.users} users, ` +
      `${result.accounts} accounts, ${result.entries} ledger entries, ${result.grants} access grants, ` +
      `${result.opsRequests} ops requests, ${result.simulatedEvents} simulated events, ` +
      `${result.onboardingApplications} onboarding applications, ${result.invitations} invitations, ${result.cards} cards, ` +
      `${result.schedules} scheduled payments, ${result.lending} lending products, ${result.loginEvents} fictional sign-in events.`,
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
