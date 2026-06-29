import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { addMonthsClamped, isTerminalOpsStatus, type OpsRequestStatus } from '@simbank/shared';
import { hashPassword } from './auth/password';
import {
  assertSeedAccessIntegrity,
  assertSeedCardIntegrity,
  assertSeedInvariants,
  assertSeedLendingIntegrity,
  assertSeedMovementIntegrity,
  assertSeedOnboardingIntegrity,
  assertSeedOpsIntegrity,
  assertSeedScheduleIntegrity,
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
  cards: number;
  schedules: number;
  lending: number;
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
  assertSeedMovementIntegrity(plan);
  assertSeedCardIntegrity(plan);
  assertSeedScheduleIntegrity(plan);
  assertSeedLendingIntegrity(plan);

  await prisma.loginEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.lendingProduct.deleteMany();
  await prisma.paymentSchedule.deleteMany();
  await prisma.accountInvitation.deleteMany();
  await prisma.cardTravelNotice.deleteMany();
  await prisma.card.deleteMany();
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
  // Track created ledger-entry ids by their seed key so a money-movement queue
  // item can be LINKED to the pending entry it posts on approval (v0.7.0).
  const ledgerEntryIdByKey = new Map<string, string>();
  for (const e of plan.entries) {
    const accountId = accountIdByKey.get(e.accountKey);
    if (!accountId) throw new Error(`Seed references an unknown account key: ${e.accountKey}`);
    const isSettled = e.status === 'posted' || e.status === 'disputed';
    // Date the entry relative to seed time so the demo shows realistic history.
    const occurredAt = new Date(now.getTime() - (e.daysAgo ?? 0) * DAY_MS);
    const created = await prisma.ledgerEntry.create({
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
    if (e.key) ledgerEntryIdByKey.set(e.key, created.id);
  }

  // SIMULATED cards (v0.8.0). Card SPEND already lives as `card`-origin ledger
  // entries; these are the card LIFECYCLE rows the customer can manage and the
  // seeded fraud alert can freeze. Track ids by key for the fraud link below.
  const YEAR_MS = 365 * DAY_MS;
  const cardIdByKey = new Map<string, string>();
  for (const c of plan.cards) {
    const accountId = accountIdByKey.get(c.accountKey);
    const userId = userIdByEmail.get(c.cardholderEmail.toLowerCase());
    if (!accountId) throw new Error(`Seed references an unknown account key: ${c.accountKey}`);
    if (!userId) throw new Error(`Seed references an unknown cardholder email: ${c.cardholderEmail}`);
    const expiry = new Date(now.getTime() + (c.expiresInYears ?? 4) * YEAR_MS);
    const card = await prisma.card.create({
      data: {
        accountId,
        userId,
        cardType: c.cardType,
        network: c.network,
        last4: c.last4,
        expMonth: expiry.getMonth() + 1,
        expYear: expiry.getFullYear(),
        status: c.status ?? 'active',
        createdAt: now,
        updatedAt: now,
      },
    });
    cardIdByKey.set(c.key, card.id);
  }

  // Operations queue work items (v0.5.0). Each gets an intake audit row so the
  // request-detail history reads "created → …" from the same AuditLog trail the
  // operator actions append to. SIMULATION: seeding a request never moves money.
  const MINUTE_MS = 60 * 1000;
  const requestIdByKey = new Map<string, string>();
  for (const r of plan.operationsRequests) {
    const occurredAt = new Date(now.getTime() - (r.daysAgo ?? 0) * DAY_MS);
    const status = (r.status ?? 'pending') as OpsRequestStatus;
    // Merge resolved ledger-entry ids into the payload so approving a reviewable
    // money movement posts its seeded pending entry (v0.7.0 / Q-01).
    let payload = r.payload ?? null;
    if (r.linkLedgerEntryKeys && r.linkLedgerEntryKeys.length > 0) {
      const ledgerEntryIds = r.linkLedgerEntryKeys.map((k) => {
        const id = ledgerEntryIdByKey.get(k);
        if (!id) throw new Error(`Seed references an unknown ledger-entry key: ${k}`);
        return id;
      });
      payload = { ...(r.payload ?? {}), ledgerEntryIds };
    }
    // Single links for fraud + dispute (v0.8.0): merge the resolved ledger-entry
    // id (+ its accountId so a DisputePayload is complete) and/or card id.
    if (r.linkLedgerEntryKey) {
      const entryId = ledgerEntryIdByKey.get(r.linkLedgerEntryKey);
      if (!entryId) throw new Error(`Seed references an unknown ledger-entry key: ${r.linkLedgerEntryKey}`);
      const entry = plan.entries.find((e) => e.key === r.linkLedgerEntryKey);
      const accountId = entry ? accountIdByKey.get(entry.accountKey) : undefined;
      payload = { ...(payload ?? {}), ledgerEntryId: entryId, ...(accountId ? { accountId } : {}) };
    }
    if (r.linkCardKey) {
      const cardId = cardIdByKey.get(r.linkCardKey);
      if (!cardId) throw new Error(`Seed references an unknown card key: ${r.linkCardKey}`);
      payload = { ...(payload ?? {}), cardId };
    }
    const request = await prisma.operationsRequest.create({
      data: {
        type: r.type,
        status,
        priority: r.priority ?? 'normal',
        summary: r.summary,
        detail: r.detail ?? null,
        subjectName: r.subjectName ?? null,
        subjectEmail: r.subjectEmail ?? null,
        payload: payload ? JSON.stringify(payload) : null,
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

  // Scheduled / recurring payments (v0.9.0). Due `firstRunInDays` after seed time
  // so a small clock advance FIRES them through the money service. No money moves
  // at seed — only the instruction is written.
  for (const s of plan.schedules) {
    const userId = userIdByEmail.get(s.ownerEmail.toLowerCase());
    const fromAccountId = accountIdByKey.get(s.fromAccountKey);
    const toAccountId = s.toAccountKey ? accountIdByKey.get(s.toAccountKey) : null;
    if (!userId) throw new Error(`Seed references an unknown schedule owner: ${s.ownerEmail}`);
    if (!fromAccountId) throw new Error(`Seed references an unknown schedule account key: ${s.fromAccountKey}`);
    if (s.toAccountKey && !toAccountId) {
      throw new Error(`Seed references an unknown schedule destination key: ${s.toAccountKey}`);
    }
    await prisma.paymentSchedule.create({
      data: {
        userId,
        kind: s.kind,
        fromAccountId,
        toAccountId: s.kind === 'internal_transfer' ? toAccountId : null,
        counterparty: s.kind === 'bill_pay' ? (s.counterparty ?? null) : null,
        memo: s.memo ?? null,
        amountMinor: s.amountMinor,
        frequency: s.frequency,
        nextRunAt: new Date(now.getTime() + s.firstRunInDays * DAY_MS),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  // Lending & deposit products (v1.0.0). Each opens a NEW `cd`/`loan` account and
  // moves the principal as a NET-ZERO `transfer` pair — the same discipline the
  // live service uses (a loan account carries the negative owed balance). Interest
  // accrues later via the clock-driven accrual driver; no money is minted here.
  for (const l of plan.lending) {
    const ownerId = userIdByEmail.get(l.ownerEmail.toLowerCase());
    const counterpartyId = accountIdByKey.get(l.counterpartyAccountKey);
    if (!ownerId) throw new Error(`Seed references an unknown lending owner: ${l.ownerEmail}`);
    if (!counterpartyId) throw new Error(`Seed references an unknown lending counterparty key: ${l.counterpartyAccountKey}`);

    const product = await prisma.account.create({
      data: { userId: ownerId, type: l.kind, name: l.name, openedAt: now, createdAt: now },
    });
    accountIdByKey.set(l.accountKey, product.id);
    await prisma.accountAccess.create({
      data: { userId: ownerId, accountId: product.id, relationship: 'owner', createdAt: now },
    });

    // CD: debit the funding account, credit the CD. Loan: debit the loan account
    // (it goes negative — the amount owed), credit the disbursement account.
    const debitAccountId = l.kind === 'cd' ? counterpartyId : product.id;
    const creditAccountId = l.kind === 'cd' ? product.id : counterpartyId;
    const debitDesc = l.kind === 'cd' ? `CD opening deposit` : `Loan principal (amount financed)`;
    const creditDesc = l.kind === 'cd' ? `CD opening deposit` : `Loan disbursement`;
    await prisma.ledgerEntry.create({
      data: { accountId: debitAccountId, amountMinor: l.principalMinor, direction: 'debit', status: 'posted', origin: 'transfer', description: debitDesc, postedAt: now, createdAt: now },
    });
    await prisma.ledgerEntry.create({
      data: { accountId: creditAccountId, amountMinor: l.principalMinor, direction: 'credit', status: 'posted', origin: 'transfer', description: creditDesc, postedAt: now, createdAt: now },
    });

    await prisma.lendingProduct.create({
      data: {
        accountId: product.id,
        kind: l.kind,
        status: 'active',
        principalMinor: l.principalMinor,
        apyBps: l.apyBps,
        termMonths: l.termMonths,
        paymentMinor: l.paymentMinor,
        openedAt: now,
        maturesAt: addMonthsClamped(now, l.termMonths),
        lastAccruedAt: now,
      },
    });
  }

  // Savings accounts accrue interest FORWARD ONLY from seed time (no back-accrual
  // of the dated seed history). The clock-driven accrual driver advances this
  // bookmark as the simulation clock passes monthly anniversaries.
  await prisma.account.updateMany({ where: { type: 'savings' }, data: { interestAccruedThrough: now } });

  // The simulation clock starts at seed time. Reset it on every seed so the demo
  // (and tests) get a deterministic "now" aligned with the seeded history.
  await prisma.simulationClock.upsert({
    where: { id: 'singleton' },
    update: { currentTime: now, speed: 1 },
    create: { id: 'singleton', currentTime: now, speed: 1 },
  });

  await prisma.auditLog.create({
    data: {
      actorRole: 'admin',
      action: 'seed_database',
      entity: 'system',
      reason:
        'Demo seed (v0.9.0: demo users + access grants + dated transaction history + operations queue + simulated events + an approvable onboarding application + a pending joint invitation + reviewable money movements each linked to its pending ledger entry + simulated cards + a fraud alert linked to a card/charge + an open dispute on a disputed charge + recurring scheduled payments, with the simulation clock reset to seed time)',
    },
  });

  const [
    users,
    accounts,
    entries,
    grants,
    opsRequests,
    simulatedEvents,
    onboardingApplications,
    invitations,
    cards,
    schedules,
    lending,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.ledgerEntry.count(),
    prisma.accountAccess.count(),
    prisma.operationsRequest.count(),
    prisma.simulatedEvent.count(),
    prisma.onboardingApplication.count(),
    prisma.accountInvitation.count(),
    prisma.card.count(),
    prisma.paymentSchedule.count(),
    prisma.lendingProduct.count(),
  ]);
  return {
    users,
    accounts,
    entries,
    grants,
    opsRequests,
    simulatedEvents,
    onboardingApplications,
    invitations,
    cards,
    schedules,
    lending,
  };
}
