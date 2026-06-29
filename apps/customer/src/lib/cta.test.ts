import { describe, expect, it } from 'vitest';
import { DASHBOARD_CTA, isAuthEntryPath, resolveCtas, type CtaLike } from './cta';

/**
 * Pure-helper unit tests for session-aware CTA resolution (Q-01). When a visitor
 * is signed in, the public "Log in" / "Open an account" entry points collapse to
 * a single "Visit your Dashboard" action; everything else passes through. No DOM.
 */

describe('isAuthEntryPath', () => {
  it('recognizes the public auth entry points', () => {
    expect(isAuthEntryPath('/login')).toBe(true);
    expect(isAuthEntryPath('/open-account')).toBe(true);
  });

  it('ignores any query string or hash on the path', () => {
    expect(isAuthEntryPath('/login?next=/dashboard')).toBe(true);
    expect(isAuthEntryPath('/open-account#apply')).toBe(true);
  });

  it('returns false for non-auth destinations', () => {
    expect(isAuthEntryPath('/dashboard')).toBe(false);
    expect(isAuthEntryPath('/checking')).toBe(false);
    expect(isAuthEntryPath('/')).toBe(false);
  });
});

describe('resolveCtas', () => {
  const hero: CtaLike[] = [
    { to: '/open-account', label: 'Open a (simulated) account' },
    { to: '/login', label: 'Log in' },
  ];

  it('returns the list unchanged when logged out', () => {
    const result = resolveCtas(hero, false);
    expect(result).toEqual(hero);
    // A copy, not the same reference, so callers can mutate safely.
    expect(result).not.toBe(hero);
  });

  it('collapses both auth entry CTAs to a single dashboard action when logged in', () => {
    const result = resolveCtas(hero, true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ to: DASHBOARD_CTA.to, label: DASHBOARD_CTA.label });
  });

  it('preserves non-auth CTAs and keeps their order', () => {
    const mixed: CtaLike[] = [
      { to: '/checking', label: 'Explore checking' },
      { to: '/login', label: 'Log in' },
      { to: '/savings', label: 'Explore savings' },
    ];
    const result = resolveCtas(mixed, true);
    expect(result.map((c) => c.to)).toEqual(['/checking', '/dashboard', '/savings']);
  });

  it('preserves extra fields on a rewritten auth CTA (e.g. a variant)', () => {
    const withVariant = [{ to: '/login', label: 'Log in', variant: 'ghost' as const }];
    const [rewritten] = resolveCtas(withVariant, true);
    expect(rewritten).toMatchObject({
      to: '/dashboard',
      label: DASHBOARD_CTA.label,
      variant: 'ghost',
    });
  });

  it('keeps a single auth CTA as one dashboard button (no duplication)', () => {
    const result = resolveCtas([{ to: '/login', label: 'Log in' }], true);
    expect(result).toHaveLength(1);
    expect(result[0].to).toBe('/dashboard');
  });
});
