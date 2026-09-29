/**
 * Public-demo contracts (shared by the backend and both frontend apps).
 *
 * Meridian was written as a LOCAL simulation. "Public-demo mode" is an explicit,
 * opt-in deployment posture for hosting the SAME simulation as a shared,
 * disposable portfolio demo on the public internet (see
 * `docs/PUBLIC_DEMO_DEPLOYMENT.md`). It is deliberately a distinct concept from
 * `NODE_ENV=production`: production only says "built/optimized"; public-demo
 * says "strangers share this instance, so warn them, don't retain their
 * identifiers, and bound what they can do".
 *
 * Everything here is dependency-free and pure so the backend, the two Vite apps,
 * and the tests all read the exact same policy. Still a SIMULATION: no real
 * money, banking, payment, email, or SMS integrations exist in any mode.
 */

// ---- Flags ------------------------------------------------------------------

/**
 * Parse a boolean-ish environment flag (`PUBLIC_DEMO`, `VITE_PUBLIC_DEMO`,
 * `COOKIE_SECURE`, ...). Only the explicit spellings below count as true; any
 * other value (including unset) is false, so a flag can never be enabled by
 * accident. Case-insensitive, surrounding whitespace ignored.
 */
export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

// ---- Shared-demo messaging --------------------------------------------------

/**
 * The extra warning shown ONLY when public-demo mode is on. It complements —
 * never replaces — the always-on "not a real bank / no real money" notice
 * (`BRAND.simulationNotice`). Wording is intentionally calm: this is a
 * portfolio demonstration, not a production banking disclosure page.
 */
export const PUBLIC_DEMO_NOTICE = {
  /** Short label for badges/eyebrows. */
  label: 'Shared public demo',
  /** The one-sentence banner line. */
  short:
    'This is a shared public simulation. Use fictional information and a unique demo password. Other visitors may modify the shared environment. Demo data is periodically reset.',
  /** The stronger form-level warning shown before a visitor types a name, email, or password. */
  beforeYouType:
    'Before you type: this is a shared public demo, not a private account. Use a made-up name and email, and choose a throwaway password you use nowhere else. Anything you enter can be seen or changed by other visitors, and all demo data is periodically reset.',
  /** Operator-console variant. */
  operations:
    'This console is a shared public simulation. Other visitors may be acting on the same queues at the same time, and all demo data is periodically reset.',
} as const;

// ---- Privacy ----------------------------------------------------------------

/**
 * What the backend persists in place of a real visitor IP address / user-agent
 * in public-demo mode (`Session.ip`, `Session.userAgent`, `LoginEvent.ip`,
 * `LoginEvent.userAgent`). A constant, clearly non-identifying placeholder —
 * NOT a hash, fingerprint, or any other stand-in identifier. The seeded demo
 * database may still carry fictional example values for the login-history
 * feature (see the seed plan).
 */
export const PUBLIC_DEMO_PLACEHOLDER = 'public-demo';

// ---- Abuse / resource protection --------------------------------------------

/** One rate-limit bucket: at most `max` hits per `windowMs` per client key. */
export interface RateLimitRule {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window length in milliseconds (fixed window). */
  windowMs: number;
}

const MINUTES = 60_000;

/**
 * The public-demo rate limits, per client key (an anonymous client is keyed by
 * its request IP — held in memory only, never persisted; an authenticated
 * client is keyed by its user id). These apply ONLY when the backend enables
 * abuse protection (public-demo mode, or `RATE_LIMITS=true` for local
 * testing). Values are deliberately generous for one person exploring the demo
 * and deliberately small against a loop of scripted requests hitting a
 * ~500 MB single-process host. See `docs/PUBLIC_DEMO_DEPLOYMENT.md`.
 */
export const PUBLIC_DEMO_RATE_LIMITS = {
  /** Sign-in attempts (any account) per client. Backstops the seeded-account lockout exemption. */
  login: { max: 20, windowMs: 5 * MINUTES },
  /** Public account-opening applications per client (each creates several rows + a bcrypt hash). */
  onboarding: { max: 5, windowMs: 15 * MINUTES },
  /** Customer money movement (internal transfers + reviewable external movements). */
  money: { max: 30, windowMs: 5 * MINUTES },
  /** Scheduled-payment creation / cancellation. */
  schedules: { max: 20, windowMs: 5 * MINUTES },
  /** Card lifecycle + travel notices. */
  cards: { max: 30, windowMs: 5 * MINUTES },
  /** Loans / CDs: open, pay, withdraw. */
  lending: { max: 20, windowMs: 5 * MINUTES },
  /** Disputes, fraud-alert responses, joint invitations + responses. */
  risk: { max: 20, windowMs: 5 * MINUTES },
  /** Operator actions that create events / notes / reversals / clock advances. */
  operations: { max: 60, windowMs: 5 * MINUTES },
  /** Admin-created demo users (each is a bcrypt hash + up to 3 rows). */
  adminUsers: { max: 10, windowMs: 15 * MINUTES },
  /** Coarse safety valve over EVERY state-changing request from one client. */
  mutations: { max: 200, windowMs: 5 * MINUTES },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof PUBLIC_DEMO_RATE_LIMITS;

/**
 * Per-user / per-resource caps on how many of a thing may exist at once. These
 * are ALWAYS enforced (all modes) because they are ordinary server-side bounds:
 * generous enough that normal exploration never meets them, small enough that
 * one account cannot grow the shared database without limit inside one daily
 * reset cycle. Counts are of LIVE rows (active / pending), so cancelling or
 * resolving frees capacity. HTTP 409 `limit_reached` when exceeded.
 */
export const RESOURCE_CAPS = {
  /** Active schedules a user may hold. */
  activeSchedulesPerUser: 25,
  /** Open (active) CDs + loans a user may hold at once. */
  openLendingProductsPerUser: 10,
  /** Non-terminal (active / frozen) cards on one account. */
  liveCardsPerAccount: 8,
  /** Active travel notices on one card. */
  activeTravelNoticesPerCard: 10,
  /** Pending joint invitations on one account. */
  pendingInvitationsPerAccount: 10,
  /** Reviewable movements still awaiting operator review, per user. */
  pendingMovementsPerUser: 25,
  /** Submitted (unreviewed) account applications per applicant email. */
  pendingApplicationsPerEmail: 3,
} as const;

/** Hard upper bound on any JSON request body the API accepts (bytes). */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/** Upper bound on an email address we store (RFC 5321 path limit). */
export const EMAIL_MAX_LENGTH = 254;

/** Upper bound on a login password we will even compare (bcrypt uses 72 bytes). */
export const LOGIN_PASSWORD_MAX_LENGTH = 200;

/** Upper bound on a transaction-search query string. */
export const SEARCH_QUERY_MAX_LENGTH = 100;

// ---- Same-origin API resolution (frontends) ---------------------------------

export interface ResolveApiBaseUrlInput {
  /** An explicit override (e.g. `VITE_API_URL`). Blank/whitespace means "not set". */
  explicit?: string | null;
  /** The build mode (`import.meta.env.MODE`): `production` builds default to same-origin. */
  mode?: string;
  /** The browser's current origin (`window.location.origin`), when available. */
  origin?: string | null;
  /** The local-development default (`http://localhost:3000`). */
  fallback: string;
}

/**
 * Where a frontend should send API + Socket.IO traffic.
 *
 *  1. An explicit, non-blank override always wins (trailing slashes removed).
 *  2. Otherwise a PRODUCTION build talks to the page's own origin — the eventual
 *     deployment serves each built app and reverse-proxies `/api/*`, `/health`,
 *     `/status` and `/socket.io/*` on the SAME hostname, so no separate API host
 *     exists (`https://banking.cowhill.dev/api/...`).
 *  3. Otherwise (local dev, tests) the localhost backend default.
 *
 * Pure so both apps and the tests share one definition.
 */
export function resolveApiBaseUrl(input: ResolveApiBaseUrlInput): string {
  const explicit = typeof input.explicit === 'string' ? input.explicit.trim() : '';
  if (explicit) return stripTrailingSlashes(explicit);
  const origin = typeof input.origin === 'string' ? input.origin.trim() : '';
  if (input.mode === 'production' && origin && origin !== 'null')
    return stripTrailingSlashes(origin);
  return stripTrailingSlashes(input.fallback);
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}
