import { randomBytes } from 'node:crypto';
import type { AccountInvitation } from '@prisma/client';
import type {
  AccountInvitationDTO,
  AccountRelationship,
  InvitationStatus,
  SessionUser,
  SimulatedEventDTO,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { toSimulatedEventDTO } from './requests';

/**
 * Joint-account invitations (v0.6.0). An account OWNER invites another person by
 * email; accepting creates a `joint` `AccountAccess` grant — the same grant RBAC
 * already reads, so the invitee simply starts seeing the account. SIMULATION: the
 * invite is "delivered" only as a clearly-labelled `SimulatedEvent`; no real
 * email is ever sent, and accepting moves NO money.
 */

export type InvitationErrorCode = 'not_found' | 'forbidden' | 'already_responded' | 'wrong_invitee';

export class InvitationError extends Error {
  readonly code: InvitationErrorCode;
  constructor(code: InvitationErrorCode, message: string) {
    super(message);
    this.name = 'InvitationError';
    this.code = code;
  }
}

function generateToken(): string {
  return randomBytes(24).toString('hex');
}

export function toInvitationDTO(
  row: AccountInvitation,
  extra: { accountName: string | null; invitedByName: string | null } = {
    accountName: null,
    invitedByName: null,
  },
): AccountInvitationDTO {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: extra.accountName,
    inviteeEmail: row.inviteeEmail,
    invitedByName: extra.invitedByName,
    relationship: row.relationship as AccountRelationship,
    status: row.status as InvitationStatus,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  };
}

/**
 * Low-level: persist a pending invitation row. Shared by the customer invite
 * route AND onboarding provisioning (which can create one inside its transaction).
 */
export async function createInvitationRecord(
  db: DbClient,
  input: {
    accountId: string;
    invitedById: string;
    inviteeEmail: string;
    relationship: AccountRelationship;
  },
  now: Date,
): Promise<AccountInvitation> {
  return db.accountInvitation.create({
    data: {
      token: generateToken(),
      accountId: input.accountId,
      invitedById: input.invitedById,
      inviteeEmail: input.inviteeEmail.toLowerCase(),
      relationship: input.relationship,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  });
}

export interface CreatedInvitation {
  invitation: AccountInvitationDTO;
  /** SIMULATED "invitation sent" email (for the route to broadcast). */
  event: SimulatedEventDTO;
}

/**
 * Owner invites a joint owner. The route has already confirmed the caller OWNS
 * the account; this records the invitation, a simulated email, and an audit row.
 */
export async function inviteJoint(
  input: {
    accountId: string;
    accountName: string;
    inviter: SessionUser;
    inviteeEmail: string;
    relationship: AccountRelationship;
  },
  now: Date = new Date(),
): Promise<CreatedInvitation> {
  const row = await createInvitationRecord(
    prisma,
    {
      accountId: input.accountId,
      invitedById: input.inviter.id,
      inviteeEmail: input.inviteeEmail,
      relationship: input.relationship,
    },
    now,
  );

  const eventRow = await prisma.simulatedEvent.create({
    data: {
      channel: 'email',
      direction: 'outbound',
      kind: 'invitation',
      status: 'sent',
      summary: `Joint-owner invitation sent to ${input.inviteeEmail} (simulated)`,
      detail: `SIMULATION — invitation to share "${input.accountName}" was recorded, not emailed to any provider.`,
      createdAt: now,
    },
  });

  await writeAudit(prisma, {
    actorId: input.inviter.id,
    actorRole: input.inviter.role,
    action: 'invitation_created',
    entity: 'account_invitation',
    entityId: row.id,
    reason: `Invited ${input.inviteeEmail} to ${input.accountName} (simulated)`,
    metadata: {
      accountId: input.accountId,
      inviteeEmail: input.inviteeEmail,
      actorName: input.inviter.displayName,
    },
  });

  return {
    invitation: toInvitationDTO(row, {
      accountName: input.accountName,
      invitedByName: input.inviter.displayName,
    }),
    event: toSimulatedEventDTO(eventRow),
  };
}

/** Pending invitations addressed to a user (matched by their email). */
export async function listInvitationsForUser(user: SessionUser): Promise<AccountInvitationDTO[]> {
  const rows = await prisma.accountInvitation.findMany({
    where: { inviteeEmail: user.email.toLowerCase(), status: 'pending' },
    include: { account: { select: { name: true } }, invitedBy: { select: { displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) =>
    toInvitationDTO(r, { accountName: r.account?.name ?? null, invitedByName: r.invitedBy?.displayName ?? null }),
  );
}

/**
 * Accept an invitation: confirm it is addressed to THIS user and still pending,
 * then grant `joint` access (the same grant RBAC reads) and mark it accepted.
 * Idempotent on the access grant. Throws {@link InvitationError} otherwise.
 */
export async function acceptInvitation(
  invitationId: string,
  user: SessionUser,
  now: Date = new Date(),
): Promise<AccountInvitationDTO> {
  const row = await prisma.accountInvitation.findUnique({
    where: { id: invitationId },
    include: { account: { select: { name: true } }, invitedBy: { select: { displayName: true } } },
  });
  if (!row) throw new InvitationError('not_found', 'That invitation does not exist.');
  if (row.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new InvitationError('wrong_invitee', 'That invitation was sent to a different email address.');
  }
  if (row.status !== 'pending') {
    throw new InvitationError('already_responded', 'That invitation has already been responded to.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.accountAccess.upsert({
      where: { userId_accountId: { userId: user.id, accountId: row.accountId } },
      create: { userId: user.id, accountId: row.accountId, relationship: row.relationship },
      update: {}, // already has access → leave it; accepting is still recorded below
    });
    await tx.accountInvitation.update({
      where: { id: row.id },
      data: { status: 'accepted', acceptedById: user.id, respondedAt: now, updatedAt: now },
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'invitation_accepted',
      entity: 'account_invitation',
      entityId: row.id,
      reason: `Accepted ${row.relationship} access to ${row.account?.name ?? row.accountId} (simulated)`,
      metadata: { accountId: row.accountId, actorName: user.displayName },
    });
  });

  return toInvitationDTO(
    { ...row, status: 'accepted', acceptedById: user.id, respondedAt: now },
    { accountName: row.account?.name ?? null, invitedByName: row.invitedBy?.displayName ?? null },
  );
}

/** Decline an invitation addressed to this user. */
export async function declineInvitation(
  invitationId: string,
  user: SessionUser,
  now: Date = new Date(),
): Promise<AccountInvitationDTO> {
  const row = await prisma.accountInvitation.findUnique({
    where: { id: invitationId },
    include: { account: { select: { name: true } }, invitedBy: { select: { displayName: true } } },
  });
  if (!row) throw new InvitationError('not_found', 'That invitation does not exist.');
  if (row.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new InvitationError('wrong_invitee', 'That invitation was sent to a different email address.');
  }
  if (row.status !== 'pending') {
    throw new InvitationError('already_responded', 'That invitation has already been responded to.');
  }
  await prisma.accountInvitation.update({
    where: { id: row.id },
    data: { status: 'declined', respondedAt: now, updatedAt: now },
  });
  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: 'invitation_declined',
    entity: 'account_invitation',
    entityId: row.id,
    reason: `Declined invitation to ${row.account?.name ?? row.accountId} (simulated)`,
    metadata: { accountId: row.accountId, actorName: user.displayName },
  });
  return toInvitationDTO(
    { ...row, status: 'declined', respondedAt: now },
    { accountName: row.account?.name ?? null, invitedByName: row.invitedBy?.displayName ?? null },
  );
}
