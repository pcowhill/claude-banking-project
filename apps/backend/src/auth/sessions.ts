import type { PrismaClient, Session, User } from '@prisma/client';
import { AUTH } from '@simbank/shared';
import { generateSessionToken, hashSessionToken } from './tokens';

/**
 * Server-side session lifecycle, backed by the `Session` table. Sessions use an
 * opaque cookie token whose hash (only) is stored, and an idle timeout that
 * slides forward on each authenticated request.
 */

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + AUTH.sessionTtlMinutes * 60_000);
}

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Create a session for a user and return the RAW token to put in the cookie.
 * The raw token is never persisted — only its hash is.
 */
export async function createSession(
  prisma: PrismaClient,
  userId: string,
  now: Date,
  ctx: SessionContext = {},
): Promise<string> {
  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: expiryFrom(now),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
  return token;
}

/**
 * Resolve a raw cookie token to its (active) session + user, sliding the idle
 * timeout forward. Returns null for missing, revoked, expired, or
 * disabled-user sessions. Never throws on a bad token.
 */
export async function resolveSession(
  prisma: PrismaClient,
  token: string,
  now: Date,
): Promise<{ session: Session; user: User } | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (session.user.status !== 'active') return null;

  // Sliding idle timeout: each use extends the session.
  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: now, expiresAt: expiryFrom(now) },
  });

  const { user, ...rest } = session;
  return { session: rest as Session, user };
}

/** Revoke the session identified by a raw cookie token (idempotent). */
export async function revokeSession(
  prisma: PrismaClient,
  token: string,
  now: Date,
): Promise<void> {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
}
