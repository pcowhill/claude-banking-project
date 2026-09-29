import type { FastifyInstance } from 'fastify';
import { PLATFORM_META, type StatusResponse } from '@simbank/shared';
import { config } from '../config';
import { checkDatabase } from '../db';

/** Readiness + platform metadata. Touches the database (degrades gracefully). */
export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async (): Promise<StatusResponse> => {
    const database = await checkDatabase();
    return {
      status: database.connected ? 'ok' : 'degraded',
      version: PLATFORM_META.version,
      milestone: PLATFORM_META.milestone,
      milestoneName: PLATFORM_META.milestoneName,
      isSimulation: true,
      environment: config.environment,
      // Lets the frontends show the shared-public-demo warning even when they
      // were built without `VITE_PUBLIC_DEMO` (the backend flag is authoritative).
      publicDemo: config.publicDemo,
      database,
      serverTime: new Date().toISOString(),
    };
  });
}
