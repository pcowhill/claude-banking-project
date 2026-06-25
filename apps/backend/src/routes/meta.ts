import type { FastifyInstance } from 'fastify';
import { BRAND, PLATFORM_META, type MetaResponse } from '@simbank/shared';

/** Root descriptor + static platform metadata for clients. */
export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    return {
      name: `${BRAND.name} Simulated Banking API`,
      isSimulation: true,
      message: BRAND.simulationNotice,
      endpoints: ['/health', '/status', '/api/meta'],
    };
  });

  app.get('/api/meta', async (): Promise<MetaResponse> => {
    return {
      name: BRAND.legalName,
      version: PLATFORM_META.version,
      milestone: PLATFORM_META.milestone,
      isSimulation: true,
      disclaimer: BRAND.simulationNotice,
    };
  });
}
