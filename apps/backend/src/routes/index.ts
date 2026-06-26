import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { statusRoutes } from './status';
import { metaRoutes } from './meta';
import { authRoutes } from './auth';
import { accountRoutes } from './accounts';
import { opsRoutes } from './ops';
import { onboardingRoutes } from './onboarding';
import { moneyRoutes } from './money';

/** Register all HTTP routes. New feature route groups are added here. */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(metaRoutes);
  await app.register(healthRoutes);
  await app.register(statusRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(opsRoutes);
  await app.register(onboardingRoutes);
  await app.register(moneyRoutes);
}
