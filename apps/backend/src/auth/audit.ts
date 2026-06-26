import type { PrismaClient } from '@prisma/client';
import type { LoginReason } from '@simbank/shared';
import type { DbClient } from '../db';

/**
 * Two complementary trails are written on auth activity:
 *
 *  - `LoginEvent` — one row per login ATTEMPT (success or failure). This is the
 *    customer-facing "recent sign-in activity" / login history and the data the
 *    lockout policy is derived from.
 *  - `AuditLog` — the system audit trail. We write a row for the security-
 *    significant transitions (login, logout, account locked) so administrators
 *    have a single trail of notable actions, consistent with how admin
 *    adjustments are audited elsewhere.
 */

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordLoginEvent(
  prisma: PrismaClient,
  input: {
    userId: string | null;
    email: string;
    success: boolean;
    reason: LoginReason;
    ctx?: RequestContext;
  },
): Promise<void> {
  await prisma.loginEvent.create({
    data: {
      userId: input.userId,
      email: input.email,
      success: input.success,
      reason: input.reason,
      ip: input.ctx?.ip ?? null,
      userAgent: input.ctx?.userAgent ?? null,
    },
  });
}

export async function writeAudit(
  prisma: DbClient,
  input: {
    actorId?: string | null;
    actorRole?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
