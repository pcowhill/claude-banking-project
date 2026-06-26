import {
  ONBOARDING_PRODUCT_LABELS,
  type AdminCreateUserResponse,
  type NormalizedAdminCreateUser,
  type SessionUser,
} from '@simbank/shared';
import { prisma } from '../db';
import { hashPassword } from '../auth/password';
import { writeAudit } from '../auth/audit';

/**
 * Admin-initiated demo-user provisioning (v0.6.0). An admin can create a user and
 * optionally open + fund an account for them. Funding is a BANK-ORIGINATED
 * `adjustment` and therefore — per the constitution — requires a REASON and an
 * audit row (both enforced here and by the shared `validateAdminCreateUser`).
 * Balances stay DERIVED; the demo password returned is non-secret (SIMULATION).
 */

export type AdminUserErrorCode = 'conflict';

export class AdminUserError extends Error {
  readonly code: AdminUserErrorCode;
  constructor(code: AdminUserErrorCode, message: string) {
    super(message);
    this.name = 'AdminUserError';
    this.code = code;
  }
}

export async function adminCreateUser(
  input: NormalizedAdminCreateUser,
  actor: SessionUser,
  now: Date = new Date(),
): Promise<AdminCreateUserResponse> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AdminUserError('conflict', `A user with the email ${input.email} already exists.`);
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        status: 'active',
        passwordHash,
        passwordUpdatedAt: now,
      },
    });

    let account: { id: string; type: string; name: string } | null = null;
    if (input.product) {
      const name = ONBOARDING_PRODUCT_LABELS[input.product];
      const created = await tx.account.create({
        data: { userId: user.id, type: input.product, name, openedAt: now },
      });
      await tx.accountAccess.create({
        data: { userId: user.id, accountId: created.id, relationship: 'owner' },
      });
      account = { id: created.id, type: created.type, name: created.name };

      // Initial funding (if any) is an AUDITED admin adjustment with a reason —
      // money enters only via this explicit bank-originated event.
      if (input.initialFundingMinor > 0) {
        await tx.ledgerEntry.create({
          data: {
            accountId: created.id,
            amountMinor: input.initialFundingMinor,
            direction: 'credit',
            status: 'posted',
            origin: 'adjustment',
            description: 'Admin opening adjustment (simulated)',
            reason: input.reason,
            postedAt: now,
            createdAt: now,
          },
        });
        await writeAudit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'admin_adjustment',
          entity: 'ledger_entry',
          entityId: created.id,
          reason: input.reason,
          metadata: {
            amountMinor: input.initialFundingMinor,
            origin: 'adjustment',
            accountId: created.id,
            actorName: actor.displayName,
          },
        });
      }
    }

    await writeAudit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'admin_create_user',
      entity: 'user',
      entityId: user.id,
      reason: `Admin created ${input.role} ${input.email} (simulated)`,
      metadata: {
        role: input.role,
        accountId: account?.id ?? null,
        fundedMinor: input.initialFundingMinor,
        actorName: actor.displayName,
      },
    });

    return { user, account };
  });

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      role: input.role,
      status: result.user.status,
      createdAt: result.user.createdAt.toISOString(),
    },
    account: result.account,
    demoPassword: input.password,
  };
}
