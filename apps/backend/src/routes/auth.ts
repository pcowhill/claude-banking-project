import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  AUTH,
  type ApiErrorResponse,
  type AuthResponse,
  type LoginEventDTO,
  type LoginRequest,
  type SessionUser,
  type UserRole,
} from '@simbank/shared';
import { prisma } from '../db';
import { DECOY_PASSWORD_HASH, verifyPassword } from '../auth/password';
import { isLocked, normalizeForAttempt, registerFailure, registerSuccess } from '../auth/lockout';
import { createSession, revokeSession } from '../auth/sessions';
import { hashSessionToken } from '../auth/tokens';
import { recordLoginEvent, writeAudit } from '../auth/audit';
import { requestContext, requireAuth } from '../auth/guards';
import { SESSION_COOKIE, clearedCookieOptions, sessionCookieOptions } from '../auth/cookies';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function toSessionUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as UserRole,
  };
}

function send401(reply: FastifyReply, body: ApiErrorResponse): FastifyReply {
  return reply.code(401).send(body);
}

/**
 * Authentication endpoints: login (with lockout + login history + audit),
 * logout, the current-user probe, and the customer's login history.
 *
 * SIMULATION: all credentials are non-secret demo passwords for fake users.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body as Partial<LoginRequest> | undefined;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) {
      return reply
        .code(400)
        .send({ error: 'Email and password are required.', code: 'invalid_request' });
    }

    const ctx = requestContext(req);
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { email } });

    // Unknown email: still run a hash comparison against a decoy so the timing
    // of "no such user" and "wrong password" stays similar (no user enumeration).
    if (!user) {
      await verifyPassword(password, DECOY_PASSWORD_HASH);
      await recordLoginEvent(prisma, {
        userId: null,
        email,
        success: false,
        reason: 'invalid_credentials',
        ctx,
      });
      return send401(reply, { error: 'Invalid email or password.', code: 'invalid_credentials' });
    }

    if (user.status !== 'active') {
      await recordLoginEvent(prisma, {
        userId: user.id,
        email,
        success: false,
        reason: 'account_disabled',
        ctx,
      });
      return reply
        .code(403)
        .send({ error: 'This account is disabled.', code: 'account_disabled' });
    }

    // Clear an expired lock, then reject if a live lock remains.
    const state = normalizeForAttempt(
      { failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil },
      now,
    );
    if (isLocked(state, now)) {
      await recordLoginEvent(prisma, {
        userId: user.id,
        email,
        success: false,
        reason: 'account_locked',
        ctx,
      });
      return reply.code(423).send({
        error: 'This account is temporarily locked due to repeated failed logins. Try again later.',
        code: 'account_locked',
      } satisfies ApiErrorResponse);
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      const next = registerFailure(state, now);
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: next.failedLoginAttempts, lockedUntil: next.lockedUntil },
      });
      const justLocked = isLocked(next, now);
      await recordLoginEvent(prisma, {
        userId: user.id,
        email,
        success: false,
        reason: justLocked ? 'account_locked' : 'invalid_credentials',
        ctx,
      });
      if (justLocked) {
        await writeAudit(prisma, {
          actorId: user.id,
          actorRole: user.role,
          action: 'account_locked',
          entity: 'user',
          entityId: user.id,
          reason: 'Too many failed login attempts',
          metadata: { failedLoginAttempts: next.failedLoginAttempts },
        });
        return reply.code(423).send({
          error: 'Too many failed attempts — this account is now temporarily locked.',
          code: 'account_locked',
        } satisfies ApiErrorResponse);
      }
      return send401(reply, { error: 'Invalid email or password.', code: 'invalid_credentials' });
    }

    // Success: reset lockout counters, stamp last login, open a session.
    const reset = registerSuccess();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: reset.failedLoginAttempts,
        lockedUntil: reset.lockedUntil,
        lastLoginAt: now,
      },
    });
    const token = await createSession(prisma, user.id, now, ctx);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions());
    await recordLoginEvent(prisma, {
      userId: user.id,
      email,
      success: true,
      reason: 'ok',
      ctx,
    });
    await writeAudit(prisma, {
      actorId: user.id,
      actorRole: user.role,
      action: 'login',
      entity: 'session',
      entityId: user.id,
    });
    return reply.code(200).send({ user: toSessionUser(user) } satisfies AuthResponse);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const now = new Date();
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: true },
      });
      await revokeSession(prisma, token, now);
      if (session) {
        await writeAudit(prisma, {
          actorId: session.userId,
          actorRole: session.user.role,
          action: 'logout',
          entity: 'session',
          entityId: session.id,
        });
      }
    }
    reply.clearCookie(SESSION_COOKIE, clearedCookieOptions());
    return reply.code(200).send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user;
    if (!user) return send401(reply, { error: 'Not authenticated.', code: 'unauthenticated' });
    return reply.send({ user } satisfies AuthResponse);
  });

  app.get('/api/auth/login-history', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user;
    if (!user) return send401(reply, { error: 'Not authenticated.', code: 'unauthenticated' });
    const events = await prisma.loginEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: AUTH.loginHistoryLimit,
    });
    const dto: LoginEventDTO[] = events.map((e) => ({
      id: e.id,
      success: e.success,
      reason: e.reason,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString(),
    }));
    return reply.send({ events: dto });
  });
}
