import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { statusRoutes } from './status';
import { metaRoutes } from './meta';

/** Register all HTTP routes. New feature route groups are added here. */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(metaRoutes);
  await app.register(healthRoutes);
  await app.register(statusRoutes);
}
