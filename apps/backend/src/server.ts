import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { MAX_REQUEST_BODY_BYTES } from '@simbank/shared';
import { config } from './config';
import { registerRoutes } from './routes/index';
import { noopOpsRealtime, type OpsRealtime } from './ops/realtime';
import { csrfHook } from './auth/csrf';
import { mutationValveHook } from './abuse/rate-limit';

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
    logger: config.isTest
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
          // PUBLIC-DEMO PRIVACY: the default request serializer logs the client's
          // remote address on every request. In public-demo mode log only the
          // method + URL so visitor IPs are neither persisted (see
          // `auth/guards.ts`) nor written to the process log.
          ...(config.publicDemo
            ? {
                serializers: {
                  req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
                },
              }
            : {}),
        },
    // Trust the proxy hop: in the eventual deployment a same-origin reverse proxy
    // on the same host forwards to this process on loopback, so `req.ip` is the
    // forwarded client address (used ONLY for the in-memory rate limiter in
    // public-demo mode; never persisted there). Harmless in local dev.
    trustProxy: true,
    // Every legitimate JSON body this API accepts is a few hundred bytes; cap the
    // whole body well below Fastify's 1 MiB default so a visitor cannot post
    // multi-megabyte payloads at a ~500 MB host.
    bodyLimit: MAX_REQUEST_BODY_BYTES,
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // Cookie parsing for session auth. Registered at the top level (before routes)
  // and with `decorateRequest` so `req.cookies` / `req.user` exist everywhere.
  await app.register(cookie);
  app.decorateRequest('user', null);

  // CSRF (v1.0.0 / SEC-1): a global double-submit check. Registered AFTER the
  // cookie plugin so `req.cookies` is populated. Issues a token cookie on safe
  // requests; rejects a mutating request whose `x-meridian-csrf` header does not
  // match the `mer_csrf` cookie (login/logout/public-onboarding are exempt).
  app.addHook('onRequest', csrfHook);

  // Coarse abuse valve (public-demo mode only): caps state-changing requests
  // per client IP in memory. Route-specific buckets are added per route.
  app.addHook('onRequest', mutationValveHook);

  // PUBLIC DEMO: tell crawlers not to index API responses either (the HTML
  // entry points carry `<meta name="robots" content="noindex, nofollow">`; the
  // reverse proxy may add the same header for the static sites later).
  if (config.publicDemo) {
    app.addHook('onSend', async (_req, reply) => {
      reply.header('x-robots-tag', 'noindex, nofollow');
    });
  }

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
