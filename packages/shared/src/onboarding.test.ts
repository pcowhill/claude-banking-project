import { describe, it, expect } from 'vitest';
import {
  ADMIN_CREATABLE_ROLES,
  DEMO_DEFAULT_PASSWORD,
  ONBOARDING_FUNDING,
  ONBOARDING_PRODUCTS,
  isLikelyEmail,
  isOnboardingProduct,
  validateAdminCreateUser,
  validateInvitation,
  validateOpenAccount,
} from './onboarding';

describe('isLikelyEmail', () => {
  it('accepts plausible addresses and rejects junk', () => {
    expect(isLikelyEmail('a@b.co')).toBe(true);
    expect(isLikelyEmail('taylor.prospect@example.com')).toBe(true);
    expect(isLikelyEmail('no-at-sign')).toBe(false);
    expect(isLikelyEmail('a@b')).toBe(false);
    expect(isLikelyEmail('a b@c.com')).toBe(false);
    expect(isLikelyEmail(42)).toBe(false);
  });
});

describe('isOnboardingProduct', () => {
  it('only accepts checking and savings', () => {
    expect(isOnboardingProduct('checking')).toBe(true);
    expect(isOnboardingProduct('savings')).toBe(true);
    expect(isOnboardingProduct('credit_card')).toBe(false);
    expect(isOnboardingProduct('loan')).toBe(false);
    expect([...ONBOARDING_PRODUCTS]).toEqual(['checking', 'savings']);
  });
});

describe('validateOpenAccount', () => {
  const valid = {
    fullName: 'Taylor Prospect',
    email: 'Taylor.Prospect@Example.com',
    password: 'Sufficient1',
    product: 'checking' as const,
    initialFundingMinor: 10_000,
    consent: true,
  };

  it('accepts a complete application and normalizes email + product', () => {
    const r = validateOpenAccount(valid);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
    expect(r.value).toMatchObject({
      fullName: 'Taylor Prospect',
      email: 'taylor.prospect@example.com', // lowercased + trimmed
      product: 'checking',
      initialFundingMinor: 10_000,
      jointInviteEmail: null,
    });
  });

  it('requires name, a valid email, a long-enough password, a product, and consent', () => {
    const r = validateOpenAccount({
      fullName: '   ',
      email: 'bad',
      password: 'short',
      product: 'loan',
      initialFundingMinor: 0,
      consent: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.fullName).toBeTruthy();
    expect(r.errors.email).toBeTruthy();
    expect(r.errors.password).toBeTruthy();
    expect(r.errors.product).toBeTruthy();
    expect(r.errors.consent).toBeTruthy();
    expect(r.value).toBeUndefined();
  });

  it('bounds the opening deposit to the simulated max', () => {
    expect(validateOpenAccount({ ...valid, initialFundingMinor: -1 }).errors.initialFundingMinor).toBeTruthy();
    expect(
      validateOpenAccount({ ...valid, initialFundingMinor: ONBOARDING_FUNDING.maxMinor + 1 }).errors
        .initialFundingMinor,
    ).toBeTruthy();
    expect(validateOpenAccount({ ...valid, initialFundingMinor: 12.5 }).errors.initialFundingMinor).toBeTruthy();
    // 0 (fund later) and the exact max are allowed.
    expect(validateOpenAccount({ ...valid, initialFundingMinor: 0 }).ok).toBe(true);
    expect(validateOpenAccount({ ...valid, initialFundingMinor: ONBOARDING_FUNDING.maxMinor }).ok).toBe(true);
  });

  it('accepts an optional joint invite but rejects inviting yourself', () => {
    const ok = validateOpenAccount({ ...valid, jointInviteEmail: 'Jordan@Example.com' });
    expect(ok.ok).toBe(true);
    expect(ok.value?.jointInviteEmail).toBe('jordan@example.com');

    const self = validateOpenAccount({ ...valid, jointInviteEmail: valid.email });
    expect(self.ok).toBe(false);
    expect(self.errors.jointInviteEmail).toBeTruthy();

    const blankIsFine = validateOpenAccount({ ...valid, jointInviteEmail: '   ' });
    expect(blankIsFine.ok).toBe(true);
    expect(blankIsFine.value?.jointInviteEmail).toBeNull();
  });
});

describe('validateInvitation', () => {
  it('accepts a valid invitee and defaults the relationship to joint', () => {
    const r = validateInvitation({ inviteeEmail: 'New.Person@example.com' }, 'owner@example.com');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ inviteeEmail: 'new.person@example.com', relationship: 'joint' });
  });

  it('rejects inviting yourself and invalid emails', () => {
    expect(validateInvitation({ inviteeEmail: 'owner@example.com' }, 'owner@example.com').ok).toBe(false);
    expect(validateInvitation({ inviteeEmail: 'nope' }, 'owner@example.com').ok).toBe(false);
    expect(validateInvitation({}, 'owner@example.com').ok).toBe(false);
  });
});

describe('validateAdminCreateUser', () => {
  it('creates a plain user with the default demo password', () => {
    const r = validateAdminCreateUser({ email: 'demo@example.com', displayName: 'Demo User' });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      email: 'demo@example.com',
      displayName: 'Demo User',
      role: 'customer',
      product: null,
      initialFundingMinor: 0,
      reason: null,
      password: DEMO_DEFAULT_PASSWORD,
    });
  });

  it('requires a reason AND an account when funding > 0 (audited adjustment)', () => {
    const noReason = validateAdminCreateUser({
      email: 'demo@example.com',
      displayName: 'Demo',
      product: 'checking',
      initialFundingMinor: 5_000,
    });
    expect(noReason.ok).toBe(false);
    expect(noReason.errors.reason).toBeTruthy();

    const noAccount = validateAdminCreateUser({
      email: 'demo@example.com',
      displayName: 'Demo',
      initialFundingMinor: 5_000,
      reason: 'Opening balance for demo',
    });
    expect(noAccount.ok).toBe(false);
    expect(noAccount.errors.product).toBeTruthy();

    const good = validateAdminCreateUser({
      email: 'demo@example.com',
      displayName: 'Demo',
      product: 'checking',
      initialFundingMinor: 5_000,
      reason: 'Opening balance for demo',
    });
    expect(good.ok).toBe(true);
    expect(good.value?.reason).toBe('Opening balance for demo');
  });

  it('rejects unknown roles and products', () => {
    expect(
      validateAdminCreateUser({ email: 'a@b.co', displayName: 'X', role: 'wizard' as never }).errors.role,
    ).toBeTruthy();
    expect(
      validateAdminCreateUser({ email: 'a@b.co', displayName: 'X', product: 'loan' }).errors.product,
    ).toBeTruthy();
    expect([...ADMIN_CREATABLE_ROLES]).toContain('admin');
  });
});
