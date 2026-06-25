import { DEFAULT_PORTS } from '@simbank/shared';

/**
 * Runtime configuration, read from the environment with safe local defaults.
 * Everything here is local-only; there are no credentials for external systems
 * because this simulation never talks to any.
 */
const rawOrigins = process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174';

// Which origins belong to the bank-staff operations console. Used to pick the
// per-surface session cookie so the customer portal and the operations console
// hold independent sessions (see `auth/cookies.ts`). Defaults to the ops app's
// localhost origin; we also match by the ops port below so it still works when
// the app is served on a LAN host (Vite `host: true`).
const rawOpsOrigins = process.env.OPERATIONS_ORIGINS ?? 'http://localhost:5174';

export const config = {
  port: Number(process.env.PORT ?? DEFAULT_PORTS.backend),
  host: process.env.HOST ?? '127.0.0.1',
  environment: process.env.NODE_ENV ?? 'development',
  isTest: process.env.NODE_ENV === 'test',
  corsOrigins: rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  operationsOrigins: rawOpsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** The operations console's dev port — matched as a fallback for LAN hosts. */
  operationsPort: DEFAULT_PORTS.operations,
};
