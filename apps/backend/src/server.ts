import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { registerRoutes } from './routes/index';

/**
 * Build a fully-configured Fastify instance WITHOUT starting to listen. Keeping
 * construction separate from `listen()` lets tests drive the app via
 * `app.inject()` with no open ports and clean start/stop. Real-time (Socket.IO)
 * is attached only by the runtime entrypoint (index.ts), not here.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest ? false : { level: process.env.LOG_LEVEL ?? 'info' },
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  await app.register(registerRoutes);

  return app;
}
