import { DEFAULT_PORTS } from '@simbank/shared';

/**
 * Runtime configuration, read from the environment with safe local defaults.
 * Everything here is local-only; there are no credentials for external systems
 * because this simulation never talks to any.
 */
const rawOrigins = process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174';

export const config = {
  port: Number(process.env.PORT ?? DEFAULT_PORTS.backend),
  host: process.env.HOST ?? '127.0.0.1',
  environment: process.env.NODE_ENV ?? 'development',
  isTest: process.env.NODE_ENV === 'test',
  corsOrigins: rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
