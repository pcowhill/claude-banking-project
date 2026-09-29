import { describe, expect, it } from 'vitest';
import {
  EMAIL_MAX_LENGTH,
  parseBooleanFlag,
  PUBLIC_DEMO_RATE_LIMITS,
  RESOURCE_CAPS,
  resolveApiBaseUrl,
} from './public-demo';
import {
  isLikelyEmail,
  validateAdminCreateUser,
  validateOpenAccount,
  DEMO_DEFAULT_PASSWORD,
} from './onboarding';

describe('parseBooleanFlag', () => {
  it('accepts only explicit truthy spellings', () => {
    for (const v of ['true', 'TRUE', ' 1 ', 'yes', 'on']) expect(parseBooleanFlag(v)).toBe(true);
    for (const v of ['false', '0', '', 'no', 'off', undefined, null, 1, true, 'production'])
      expect(parseBooleanFlag(v)).toBe(false);
  });
});

describe('resolveApiBaseUrl (same-origin production routing)', () => {
  const fallback = 'http://localhost:3000';

  it('defaults to the localhost backend in development', () => {
    expect(
      resolveApiBaseUrl({ mode: 'development', origin: 'http://localhost:5173', fallback }),
    ).toBe(fallback);
    expect(resolveApiBaseUrl({ mode: 'test', fallback })).toBe(fallback);
  });

  it('uses the browser origin for a production build (no separate API host)', () => {
    expect(
      resolveApiBaseUrl({ mode: 'production', origin: 'https://banking.cowhill.dev', fallback }),
    ).toBe('https://banking.cowhill.dev');
    expect(
      resolveApiBaseUrl({
        mode: 'production',
        origin: 'https://banking-ops.cowhill.dev/',
        fallback,
      }),
    ).toBe('https://banking-ops.cowhill.dev');
  });

  it('falls back when a production build has no usable origin (SSR / opaque origin)', () => {
    expect(resolveApiBaseUrl({ mode: 'production', origin: undefined, fallback })).toBe(fallback);
    expect(resolveApiBaseUrl({ mode: 'production', origin: 'null', fallback })).toBe(fallback);
  });

  it('an explicit override wins in every mode; blank means "not set"', () => {
    expect(
      resolveApiBaseUrl({
        explicit: 'https://api.example.test/',
        mode: 'production',
        origin: 'https://x',
        fallback,
      }),
    ).toBe('https://api.example.test');
    expect(
      resolveApiBaseUrl({ explicit: 'http://127.0.0.1:8102', mode: 'development', fallback }),
    ).toBe('http://127.0.0.1:8102');
    expect(
      resolveApiBaseUrl({
        explicit: '   ',
        mode: 'production',
        origin: 'https://banking.cowhill.dev',
        fallback,
      }),
    ).toBe('https://banking.cowhill.dev');
  });
});

describe('policy constants are sane', () => {
  it('every rate-limit rule has a positive max and window', () => {
    for (const [name, rule] of Object.entries(PUBLIC_DEMO_RATE_LIMITS)) {
      expect(rule.max, name).toBeGreaterThan(0);
      expect(rule.windowMs, name).toBeGreaterThan(0);
    }
  });
  it('every resource cap is a small positive integer', () => {
    for (const [name, cap] of Object.entries(RESOURCE_CAPS)) {
      expect(Number.isInteger(cap), name).toBe(true);
      expect(cap, name).toBeGreaterThan(0);
      expect(cap, name).toBeLessThanOrEqual(100);
    }
  });
});

describe('server-side input bounds (shared validators)', () => {
  it('rejects an over-long email everywhere emails are validated', () => {
    const long = `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`;
    expect(isLikelyEmail(long)).toBe(false);
    expect(isLikelyEmail('avery.customer@example.com')).toBe(true);
    const app = validateOpenAccount({
      fullName: 'A',
      email: long,
      password: 'Password123!',
      product: 'checking',
      initialFundingMinor: 0,
      consent: true,
    });
    expect(app.ok).toBe(false);
    expect(app.errors.email).toBeTruthy();
  });

  it('rejects an over-long admin-created user password instead of hashing it', () => {
    const result = validateAdminCreateUser({
      email: 'new.user@example.com',
      displayName: 'New User',
      password: 'x'.repeat(201),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.password).toBeTruthy();
    const ok = validateAdminCreateUser({ email: 'new.user@example.com', displayName: 'New User' });
    expect(ok.ok).toBe(true);
    expect(ok.value?.password).toBe(DEMO_DEFAULT_PASSWORD);
  });
});
