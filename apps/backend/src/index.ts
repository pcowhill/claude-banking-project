import { config } from './config';
import { prisma } from './db';
import { attachRealtime } from './realtime';
import { SocketOpsRealtime } from './ops/realtime';
import { buildServer } from './server';

/**
 * Runtime entrypoint: build the server, attach Socket.IO, start listening, and
 * shut down cleanly on signals. (Tests use buildServer() directly and never
 * reach this file.)
 *
 * The ops real-time publisher is created first, handed to buildServer (so routes
 * emit through it), then bound to the live Socket.IO server once it is attached.
 */
const opsRealtime = new SocketOpsRealtime();
const app = await buildServer({ opsRealtime });
const io = attachRealtime(app.server, prisma);
opsRealtime.bind(io);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `Meridian SIMULATED banking API on http://${config.host}:${config.port} — a simulation only, not a real bank`,
  );
  // Make the deployment posture unmistakable in the log (no secrets involved):
  // which mode we are in and where the (only) mutable state lives.
  const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
  app.log.info(
    `posture: NODE_ENV=${config.environment} PUBLIC_DEMO=${config.publicDemo} secureCookies=${config.secureCookies} rateLimits=${config.rateLimitsEnabled} DATABASE_URL=${databaseUrl}`,
  );
  if (config.publicDemo && !/^file:(\/|[A-Za-z]:)/.test(databaseUrl)) {
    app.log.warn(
      'PUBLIC_DEMO is on but DATABASE_URL is not an absolute file: URL — the live database should live OUTSIDE the release directory (e.g. file:/srv/apps/meridian/data/meridian.db).',
    );
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received — shutting down`);
  io.close();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
