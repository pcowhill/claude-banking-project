import { describe, it, expect } from 'vitest';
import { BANK_ORIGINATED_ORIGINS, USER_ROLES } from '@simbank/shared';
import { assertSeedAccessIntegrity, assertSeedInvariants, buildSeedPlan } from './seed-plan';

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
