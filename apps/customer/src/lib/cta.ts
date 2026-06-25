/**
 * Session-aware call-to-action resolution for the public marketing site
 * (v0.4.0, task R-02).
 *
 * When a visitor is already signed in, the public "Log in" / "Open an account"
 * entry points are confusing — they would bounce an authenticated user to a
 * login or onboarding screen. Per the v0.3.0 review feedback, those CTAs instead
 * collapse to a single "Visit your Dashboard" action pointing at the portal.
 * CTAs that go anywhere else (product pages, etc.) are left untouched.
 *
 * This module is intentionally pure (no React) so it can be unit-tested and so
 * the presentational marketing components stay easy to reason about.
 */

/** The minimal shape a CTA needs for rewriting; extra fields are preserved. */
export interface CtaLike {
  to: string;
  label: string;
}

/** Public auth entry points that should redirect a signed-in user to the dashboard. */
export const AUTH_ENTRY_PATHS = ['/login', '/open-account'] as const;

/** The signed-in replacement target + label. */
export const DASHBOARD_CTA = { to: '/dashboard', label: 'Visit your Dashboard' } as const;

/** True when a CTA destination is a public auth entry point (ignoring any hash/query). */
export function isAuthEntryPath(to: string): boolean {
  const path = to.split(/[?#]/)[0];
  return (AUTH_ENTRY_PATHS as readonly string[]).includes(path);
}

/**
 * Rewrite a list of CTAs for the given auth state.
 *
 *  - Logged out: returned unchanged.
 *  - Logged in: every auth-entry CTA becomes "Visit your Dashboard" (→
 *    `/dashboard`), deduped so a hero with both "Open an account" and "Log in"
 *    collapses to a single dashboard button while keeping its position/variant;
 *    all non-auth CTAs pass through untouched.
 */
export function resolveCtas<T extends CtaLike>(ctas: readonly T[], loggedIn: boolean): T[] {
  if (!loggedIn) return [...ctas];
  const out: T[] = [];
  let dashboardAdded = false;
  for (const cta of ctas) {
    if (isAuthEntryPath(cta.to)) {
      if (dashboardAdded) continue;
      dashboardAdded = true;
      out.push({ ...cta, to: DASHBOARD_CTA.to, label: DASHBOARD_CTA.label });
    } else {
      out.push(cta);
    }
  }
  return out;
}
