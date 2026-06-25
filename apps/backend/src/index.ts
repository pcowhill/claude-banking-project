import { config } from './config';
import { prisma } from './db';
import { attachRealtime } from './realtime';
import { buildServer } from './server';

/**
 * Runtime entrypoint: build the server, attach Socket.IO, start listening, and
 * shut down cleanly on signals. (Tests use buildServer() directly and never
 * reach this file.)
 */
const app = await buildServer();
const io = attachRealtime(app.server);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `Meridian SIMULATED banking API on http://localhost:${config.port} — local simulation only, not a real bank`,
  );
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
