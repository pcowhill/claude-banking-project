import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { isTerminalOpsStatus, type OpsRequestStatus } from '@simbank/shared';
import { hashPassword } from './auth/password';
import {
  assertSeedAccessIntegrity,
  assertSeedInvariants,
  assertSeedOnboardingIntegrity,
  assertSeedOpsIntegrity,
  type SeedPlan,
} from './seed-plan';

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
  opsRequests: number;
  simulatedEvents: number;
  onboardingApplications: number;
  invitations: number;
}

export async function applySeedPlan(
  prisma: PrismaClient,
  plan: SeedPlan,
  now: Date = new Date(),
): Promise<SeedResult> {
  assertSeedInvariants(plan);
  assertSeedAccessIntegrity(plan);
  assertSeedOpsIntegrity(plan);
  assertSeedOnboardingIntegrity(plan);

  await prisma.loginEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.accountInvitation.deleteMany();
  await prisma.accountAccess.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.onboardingApplication.deleteMany();
  await prisma.account.deleteMany();
  await prisma.simulatedEvent.deleteMany();
  await prisma.operationsRequest.deleteMany();
  await prisma.auditLog.deleteMany();
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

  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const e of plan.entries) {
    const accountId = accountIdByKey.get(e.accountKey);
    if (!accountId) throw new Error(`Seed references an unknown account key: ${e.accountKey}`);
    const isSettled = e.status === 'posted' || e.status === 'disputed';
    // Date the entry relative to seed time so the demo shows realistic history.
    const occurredAt = new Date(now.getTime() - (e.daysAgo ?? 0) * DAY_MS);
    await prisma.ledgerEntry.create({
      data: {
        accountId,
        amountMinor: e.amountMinor,
        direction: e.direction,
        status: e.status,
        origin: e.origin,
        description: e.description,
        postedAt: isSettled ? occurredAt : null,
        createdAt: occurredAt,
      },
    });
  }

  // Operations queue work items (v0.5.0). Each gets an intake audit row so the
  // request-detail history reads "created → …" from the same AuditLog trail the
  // operator actions append to. SIMULATION: seeding a request never moves money.
  const MINUTE_MS = 60 * 1000;
  const requestIdByKey = new Map<string, string>();
  for (const r of plan.operationsRequests) {
    const occurredAt = new Date(now.getTime() - (r.daysAgo ?? 0) * DAY_MS);
    const status = (r.status ?? 'pending') as OpsRequestStatus;
    const request = await prisma.operationsRequest.create({
      data: {
        type: r.type,
        status,
        priority: r.priority ?? 'normal',
        summary: r.summary,
        detail: r.detail ?? null,
        subjectName: r.subjectName ?? null,
        subjectEmail: r.subjectEmail ?? null,
        payload: r.payload ? JSON.stringify(r.payload) : null,
        resolvedAt: isTerminalOpsStatus(status) ? occurredAt : null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
    requestIdByKey.set(r.key, request.id);
    await prisma.auditLog.create({
      data: {
        actorRole: 'system',
        action: 'ops_request_created',
        entity: 'operations_request',
        entityId: request.id,
        reason: r.summary,
        createdAt: occurredAt,
      },
    });
  }

  // Seeded SIMULATED external events (clearly fake; never a real provider).
  for (const e of plan.simulatedEvents) {
    const occurredAt = new Date(now.getTime() - (e.minutesAgo ?? 0) * MINUTE_MS);
    await prisma.simulatedEvent.create({
      data: {
        channel: e.channel,
        direction: e.direction ?? 'outbound',
        kind: e.kind ?? null,
        status: e.status ?? 'sent',
        summary: e.summary,
        detail: e.detail ?? null,
        requestId: e.requestKey ? (requestIdByKey.get(e.requestKey) ?? null) : null,
        createdAt: occurredAt,
      },
    });
  }

  // Onboarding applications (v0.6.0): linked 1:1 to a seeded `onboarding` request
  // so a reviewer can approve it end-to-end. The non-secret demo password is
  // hashed here; the plaintext never lands in the database.
  for (const app of plan.onboardingApplications) {
    const requestId = requestIdByKey.get(app.requestKey);
    if (!requestId) throw new Error(`Seed references an unknown request key: ${app.requestKey}`);
    const passwordHash = await hashPassword(app.password);
    await prisma.onboardingApplication.create({
      data: {
        reference: app.reference,
        status: 'submitted',
        fullName: app.fullName,
        email: app.email,
        product: app.product,
        initialFundingMinor: app.initialFundingMinor,
        jointInviteEmail: app.jointInviteEmail ?? null,
        consentAt: now,
        passwordHash,
        requestId,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  // Joint-owner invitations (v0.6.0): pending so the demo can accept/decline.
  for (const invite of plan.invitations) {
    const accountId = accountIdByKey.get(invite.accountKey);
    const invitedById = userIdByEmail.get(invite.inviterEmail.toLowerCase());
    if (!accountId) throw new Error(`Seed references an unknown account key: ${invite.accountKey}`);
    if (!invitedById) throw new Error(`Seed references an unknown inviter email: ${invite.inviterEmail}`);
    await prisma.accountInvitation.create({
      data: {
        token: randomBytes(24).toString('hex'),
        accountId,
        invitedById,
        inviteeEmail: invite.inviteeEmail.toLowerCase(),
        relationship: invite.relationship,
        status: invite.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
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
      reason:
        'Demo seed (v0.6.0: demo users + access grants + dated transaction history + operations queue + simulated events + an approvable onboarding application + a pending joint invitation)',
    },
  });

  const [users, accounts, entries, grants, opsRequests, simulatedEvents, onboardingApplications, invitations] =
    await Promise.all([
      prisma.user.count(),
      prisma.account.count(),
      prisma.ledgerEntry.count(),
      prisma.accountAccess.count(),
      prisma.operationsRequest.count(),
      prisma.simulatedEvent.count(),
      prisma.onboardingApplication.count(),
      prisma.accountInvitation.count(),
    ]);
  return { users, accounts, entries, grants, opsRequests, simulatedEvents, onboardingApplications, invitations };
}
