import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@simbank/shared';

/** Liveness probe. Intentionally does NOT touch the database so it stays fast
 * and is safe for Playwright/CI to wait on before the DB is seeded. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  });
}
