import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { ApiErrorResponse, SessionUser, UserRole } from '@simbank/shared';
import { prisma } from '../db';
import { resolveSession } from './sessions';
import { SESSION_COOKIE, clearedCookieOptions } from './cookies';

// Make the authenticated user available to route handlers in a typed way.
declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

function unauthorized(reply: FastifyReply, body: ApiErrorResponse): void {
  reply.code(401).send(body);
}

/** Per-request context (client ip + user agent) for sessions and audit rows. */
export function requestContext(req: FastifyRequest): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

/**
 * preHandler that requires a valid session. On success it populates
 * `req.user`; otherwise it ends the request with 401 (clearing a dead cookie).
 */
export const requireAuth: preHandlerHookHandler = async (req, reply) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    unauthorized(reply, { error: 'Not authenticated.', code: 'unauthenticated' });
    return;
  }
  const resolved = await resolveSession(prisma, token, new Date());
  if (!resolved) {
    reply.clearCookie(SESSION_COOKIE, clearedCookieOptions());
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
