import { describe, it, expect } from 'vitest';
import {
  BANK_ORIGINATED_ORIGINS,
  OPS_REQUEST_PRIORITIES,
  OPS_REQUEST_STATUSES,
  OPS_REQUEST_TYPES,
  SIM_EVENT_CHANNELS,
  USER_ROLES,
} from '@simbank/shared';
import {
  assertSeedAccessIntegrity,
  assertSeedInvariants,
  assertSeedOpsIntegrity,
  buildSeedPlan,
} from './seed-plan';

describe('seed plan invariants', () => {
  const plan = buildSeedPlan();

  it('uses only positive integer minor amounts', () => {
    for (const entry of plan.entries) {
      expect(Number.isInteger(entry.amountMinor)).toBe(true);
      expect(entry.amountMinor).toBeGreaterThan(0);
    }
  });

  it('references only declared account keys', () => {
    const keys = new Set(plan.users.flatMap((u) => u.accounts.map((a) => a.key)));
    for (const entry of plan.entries) {
      expect(keys.has(entry.accountKey)).toBe(true);
    }
  });

  it('satisfies the money-integrity invariants (no money from nowhere)', () => {
    expect(() => assertSeedInvariants(plan)).not.toThrow();
  });

  it('internal transfers net to zero across accounts', () => {
    const transferNet = plan.entries
      .filter((e) => e.origin === 'transfer' && (e.status === 'posted' || e.status === 'disputed'))
      .reduce((sum, e) => sum + (e.direction === 'credit' ? e.amountMinor : -e.amountMinor), 0);
    expect(transferNet).toBe(0);
  });

  it('every settled credit is bank-originated or a transfer leg', () => {
    const settledCredits = plan.entries.filter(
      (e) => e.direction === 'credit' && (e.status === 'posted' || e.status === 'disputed'),
    );
    for (const credit of settledCredits) {
      const explained =
        credit.origin === 'transfer' || BANK_ORIGINATED_ORIGINS.includes(credit.origin);
      expect(explained).toBe(true);
    }
  });

  it('rejects a tampered plan that conjures money from nowhere', () => {
    const tampered = buildSeedPlan();
    tampered.entries.push({
      accountKey: tampered.users[0].accounts[0].key,
      amountMinor: 1_000_00,
      direction: 'credit',
      status: 'posted',
      origin: 'card', // not bank-originated, not a transfer leg
      description: 'illegal magic money',
    });
    expect(() => assertSeedInvariants(tampered)).toThrow(/from nowhere|non-bank/i);
  });
});

describe('seed plan auth & access (v0.2.0)', () => {
  const plan = buildSeedPlan();

  it('provides one demo user for every role', () => {
    const roles = new Set(plan.users.map((u) => u.role));
    for (const role of USER_ROLES) {
      expect(roles.has(role)).toBe(true);
    }
  });

  it('gives every demo user a non-empty password and a unique email', () => {
    const emails = new Set<string>();
    for (const user of plan.users) {
      expect(user.password.length).toBeGreaterThanOrEqual(8);
      emails.add(user.email.toLowerCase());
    }
    expect(emails.size).toBe(plan.users.length);
  });

  it('grants the joint customer access to the shared checking only (not savings)', () => {
    const jointGrants = plan.access.filter((a) => a.userEmail === 'jordan.joint@example.com');
    expect(jointGrants).toHaveLength(1);
    expect(jointGrants[0]).toMatchObject({ accountKey: 'avery-checking', relationship: 'joint' });
    expect(plan.access.some((a) => a.accountKey === 'avery-savings')).toBe(false);
  });

  it('passes the access-integrity invariants', () => {
    expect(() => assertSeedAccessIntegrity(plan)).not.toThrow();
  });

  it('rejects an access grant that references an unknown account', () => {
    const tampered = buildSeedPlan();
    tampered.access.push({
      userEmail: 'jordan.joint@example.com',
      accountKey: 'no-such-account',
      relationship: 'joint',
    });
    expect(() => assertSeedAccessIntegrity(tampered)).toThrow(/unknown account/i);
  });

  it('rejects an access grant that references an unknown user', () => {
    const tampered = buildSeedPlan();
    tampered.access.push({
      userEmail: 'ghost@example.com',
      accountKey: 'avery-checking',
      relationship: 'joint',
    });
    expect(() => assertSeedAccessIntegrity(tampered)).toThrow(/unknown user/i);
  });
});

describe('seed plan operations queue (v0.5.0)', () => {
  const plan = buildSeedPlan();

  it('seeds a non-trivial queue of work items', () => {
    expect(plan.operationsRequests.length).toBeGreaterThanOrEqual(8);
  });

  it('uses only known types, statuses, and priorities', () => {
    for (const request of plan.operationsRequests) {
      expect(OPS_REQUEST_TYPES).toContain(request.type);
      if (request.status) expect(OPS_REQUEST_STATUSES).toContain(request.status);
      if (request.priority) expect(OPS_REQUEST_PRIORITIES).toContain(request.priority);
    }
  });

  it('has unique request keys', () => {
    const keys = plan.operationsRequests.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes pending items so the console has actionable work', () => {
    const pending = plan.operationsRequests.filter((r) => (r.status ?? 'pending') === 'pending');
    expect(pending.length).toBeGreaterThan(0);
  });

  it('never seeds a terminal (approved/rejected) request — they are all actionable', () => {
    for (const request of plan.operationsRequests) {
      const status = request.status ?? 'pending';
      expect(status === 'approved' || status === 'rejected').toBe(false);
    }
  });

  it('seeds simulated events on known channels that link only to real request keys', () => {
    const keys = new Set(plan.operationsRequests.map((r) => r.key));
    for (const event of plan.simulatedEvents) {
      expect(SIM_EVENT_CHANNELS).toContain(event.channel);
      if (event.requestKey) expect(keys.has(event.requestKey)).toBe(true);
    }
  });

  it('passes the ops-integrity invariants', () => {
    expect(() => assertSeedOpsIntegrity(plan)).not.toThrow();
  });

  it('rejects a simulated event that references an unknown request key', () => {
    const tampered = buildSeedPlan();
    tampered.simulatedEvents.push({
      channel: 'sms',
      summary: 'orphan event',
      requestKey: 'no-such-request',
    });
    expect(() => assertSeedOpsIntegrity(tampered)).toThrow(/unknown request key/i);
  });

  it('rejects an unknown request type', () => {
    const tampered = buildSeedPlan();
    tampered.operationsRequests.push({
      key: 'bogus',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: 'teleport' as any,
      summary: 'bogus request',
    });
    expect(() => assertSeedOpsIntegrity(tampered)).toThrow(/unknown ops request type/i);
  });
});
