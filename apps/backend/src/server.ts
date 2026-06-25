import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config';
import { registerRoutes } from './routes/index';
import { noopOpsRealtime, type OpsRealtime } from './ops/realtime';

// Make the ops real-time publisher available to route handlers in a typed way.
declare module 'fastify' {
  interface FastifyInstance {
    opsRealtime: OpsRealtime;
  }
}

export interface BuildServerOptions {
  /**
   * Real-time publisher for operations events. Defaults to a no-op so tests and
   * any socketless run work unchanged; the runtime passes a Socket.IO-backed
   * publisher (index.ts) and tests pass a recording double to assert emissions.
   */
  opsRealtime?: OpsRealtime;
}

/**
 * Build a fully-configured Fastify instance WITHOUT starting to listen. Keeping
 * construction separate from `listen()` lets tests drive the app via
 * `app.inject()` with no open ports and clean start/stop. Real-time (Socket.IO)
 * is attached only by the runtime entrypoint (index.ts), not here; routes emit
 * through the injected `app.opsRealtime` publisher (a no-op until bound).
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Trust the proxy hop in local dev so req.ip reflects the real client for
    // session/audit context (still a local simulation — no real network).
    trustProxy: true,
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // Cookie parsing for session auth. Registered at the top level (before routes)
  // and with `decorateRequest` so `req.cookies` / `req.user` exist everywhere.
  await app.register(cookie);
  app.decorateRequest('user', null);

  // Ops real-time publisher (no-op unless the runtime binds a Socket.IO server).
  app.decorate('opsRealtime', options.opsRealtime ?? noopOpsRealtime);

  // Tolerate an EMPTY application/json body. Fastify's default JSON parser 400s on
  // an empty body, which silently breaks legitimate bodyless POSTs that still send
  // a JSON content-type (e.g. a best-effort logout) — the request would be rejected
  // before the handler runs. Treat an empty body as `{}`; malformed JSON still 400s.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : '';
    if (text.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error('Request body is not valid JSON.') as Error & { statusCode?: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  await app.register(registerRoutes);

  return app;
}
