import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { ApiErrorResponse, SessionUser, UserRole } from '@simbank/shared';
import { PUBLIC_DEMO_PLACEHOLDER } from '@simbank/shared';
import { config } from '../config';
import { prisma } from '../db';
import { resolveSession } from './sessions';
import { sessionCookieNameForRequest, clearedCookieOptions } from './cookies';

// Make the authenticated user available to route handlers in a typed way.
declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

function unauthorized(reply: FastifyReply, body: ApiErrorResponse): void {
  reply.code(401).send(body);
}

/** What `requestContext` returns; persisted on `Session` and `LoginEvent` rows. */
export interface PersistedRequestContext {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Per-request context (client ip + user agent) for sessions and login history.
 *
 * PUBLIC-DEMO PRIVACY: when `PUBLIC_DEMO=true` the REAL values are never
 * persisted — both fields become the constant {@link PUBLIC_DEMO_PLACEHOLDER}.
 * Not a hash, not a fingerprint, not a substitute identifier: every visitor's
 * rows look identical. Local development keeps the real values so the
 * login-history feature can be exercised with meaningful data.
 */
export function requestContext(req: FastifyRequest): PersistedRequestContext {
  if (config.publicDemo) {
    return { ip: PUBLIC_DEMO_PLACEHOLDER, userAgent: PUBLIC_DEMO_PLACEHOLDER };
  }
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 300) ?? null };
}

/**
 * preHandler that requires a valid session. On success it populates
 * `req.user`; otherwise it ends the request with 401 (clearing a dead cookie).
 */
export const requireAuth: preHandlerHookHandler = async (req, reply) => {
  const cookieName = sessionCookieNameForRequest(req);
  const token = req.cookies?.[cookieName];
  if (!token) {
    unauthorized(reply, { error: 'Not authenticated.', code: 'unauthenticated' });
    return;
  }
  const resolved = await resolveSession(prisma, token, new Date());
  if (!resolved) {
    reply.clearCookie(cookieName, clearedCookieOptions());
    unauthorized(reply, { error: 'Your session has expired. Please log in again.', code: 'session_expired' });
    return;
  }
  req.user = {
    id: resolved.user.id,
    email: resolved.user.email,
    displayName: resolved.user.displayName,
    role: resolved.user.role as UserRole,
  };
};

/**
 * preHandler factory that requires one of the given roles. Must run AFTER
 * `requireAuth` in the preHandler chain (it reads `req.user`).
 */
export function requireRole(...roles: UserRole[]): preHandlerHookHandler {
  return async (req, reply) => {
    if (!req.user) {
      unauthorized(reply, { error: 'Not authenticated.', code: 'unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      reply.code(403).send({
        error: 'You do not have access to this resource.',
        code: 'forbidden',
      } satisfies ApiErrorResponse);
      return;
    }
  };
}
