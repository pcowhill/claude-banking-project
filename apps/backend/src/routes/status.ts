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
      database,
      serverTime: new Date().toISOString(),
    };
  });
}
