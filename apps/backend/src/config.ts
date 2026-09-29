import { DEFAULT_PORTS, parseBooleanFlag } from '@simbank/shared';

/**
 * Runtime configuration, read from the environment with safe local defaults.
 * Everything here is simulation-only; there are no credentials for external
 * systems because this simulation never talks to any.
 *
 * Two deployment postures are distinguished ON PURPOSE (see
 * `docs/PUBLIC_DEMO_DEPLOYMENT.md`):
 *
 *  - `NODE_ENV=production` — the code is built/optimized and served over HTTPS.
 *    It turns on `Secure` cookies (overridable with `COOKIE_SECURE`).
 *  - `PUBLIC_DEMO=true` — this instance is a SHARED, DISPOSABLE public demo. It
 *    turns on the shared-demo warning, the visitor-privacy behaviour (no real
 *    IPs / user-agents persisted), the seeded-account lockout exemption, and
 *    the in-memory rate limits. It is NEVER inferred from NODE_ENV: a
 *    production build of this software is not automatically a public demo.
 */
export interface RuntimeConfig {
  port: number;
  host: string;
  environment: string;
  isTest: boolean;
  isProduction: boolean;
  /** Explicit, opt-in shared-public-demo posture (`PUBLIC_DEMO=true`). */
  publicDemo: boolean;
  /** Set the `Secure` attribute on every cookie (HTTPS only). Defaults to `isProduction`. */
  secureCookies: boolean;
  /** Enforce the in-memory abuse limits (defaults to `publicDemo`; `RATE_LIMITS=true` forces on). */
  rateLimitsEnabled: boolean;
  corsOrigins: string[];
  operationsOrigins: string[];
  /** The operations console's dev port — matched as a fallback for LAN hosts. */
  operationsPort: number;
}

function splitList(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Build a config from an environment snapshot. Pure; used by the runtime and by tests. */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = env.NODE_ENV ?? 'development';
  const isProduction = environment === 'production';
  const publicDemo = parseBooleanFlag(env.PUBLIC_DEMO);
  return {
    port: Number(env.PORT ?? DEFAULT_PORTS.backend),
    host: env.HOST ?? '127.0.0.1',
    environment,
    isTest: environment === 'test',
    isProduction,
    publicDemo,
    // `COOKIE_SECURE` lets an HTTPS dev/staging run opt in (or a plain-HTTP
    // production smoke test opt out) without pretending to be another NODE_ENV.
    secureCookies:
      env.COOKIE_SECURE !== undefined ? parseBooleanFlag(env.COOKIE_SECURE) : isProduction,
    rateLimitsEnabled: publicDemo || parseBooleanFlag(env.RATE_LIMITS),
    corsOrigins: splitList(env.CORS_ORIGINS, 'http://localhost:5173,http://localhost:5174'),
    // Which origins belong to the bank-staff operations console. Used to pick the
    // per-surface session cookie so the customer portal and the operations
    // console hold independent sessions (see `auth/cookies.ts`). Defaults to the
    // ops app's localhost origin; we also match by the ops port so it still works
    // when the app is served on a LAN host (Vite `host: true`). In production the
    // apps send the explicit surface header, so this is only a fallback.
    operationsOrigins: splitList(env.OPERATIONS_ORIGINS, 'http://localhost:5174'),
    operationsPort: DEFAULT_PORTS.operations,
  };
}

/**
 * The live configuration. A single mutable object (not re-read per request) so
 * every module sees the same values; tests may patch it through
 * {@link overrideConfigForTests} and must restore it afterwards.
 */
export const config: RuntimeConfig = resolveConfig();

/**
 * TEST ONLY. Temporarily patch the live config (e.g. `{ publicDemo: true }`)
 * and get back a function that restores the previous values. Lets the same
 * built server be exercised in local-dev and public-demo posture without
 * re-importing every module.
 */
export function overrideConfigForTests(patch: Partial<RuntimeConfig>): () => void {
  const previous: Partial<RuntimeConfig> = {};
  for (const key of Object.keys(patch) as (keyof RuntimeConfig)[]) {
    (previous as Record<string, unknown>)[key] = config[key];
  }
  Object.assign(config, patch);
  return () => {
    Object.assign(config, previous);
  };
}
