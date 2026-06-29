import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  validateInvitation,
  validateOpenAccount,
  type AccountInvitationDTO,
  type ApiErrorResponse,
  type OpenAccountResponse,
} from '@simbank/shared';
import { prisma } from '../db';
import { requireAuth } from '../auth/guards';
import { getAccountRelationship } from '../auth/access';
import { simulationNow } from '../clock/clock';
import { submitApplication } from '../ops/onboarding';
import {
  acceptInvitation,
  declineInvitation,
  inviteJoint,
  InvitationError,
  listInvitationsForUser,
} from '../ops/invitations';

/**
 * Onboarding & joint-invitation endpoints (v0.6.0).
 *
 *  - `POST /api/onboarding/applications` (PUBLIC) — submit a simulated
 *    account-opening application. Creates a queue item that FEEDS the v0.5.0
 *    operations queue (and pushes it to operators in real time). Creates NO
 *    user/account/money — an operator must approve it.
 *  - `POST /api/accounts/:id/invitations` (OWNER) — invite a joint owner.
 *  - `GET /api/invitations` (AUTH) — the signed-in user's pending invitations.
 *  - `POST /api/invitations/:id/accept|decline` (AUTH) — respond to one.
 */

const MAX_FIELD = 500;

function invalid(reply: FastifyReply, error: string, fields?: Record<string, string>): void {
  reply.code(400).send({ error, code: 'invalid_request', fields } as ApiErrorResponse & {
    fields?: Record<string, string>;
  });
}

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  // ---- Public: submit an account-opening application ------------------------
  app.post('/api/onboarding/applications', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = validateOpenAccount({
      fullName: typeof body.fullName === 'string' ? body.fullName.slice(0, MAX_FIELD) : undefined,
      email: typeof body.email === 'string' ? body.email.slice(0, MAX_FIELD) : undefined,
      password: typeof body.password === 'string' ? body.password : undefined,
      product: typeof body.product === 'string' ? body.product : undefined,
      initialFundingMinor:
        typeof body.initialFundingMinor === 'number' ? body.initialFundingMinor : undefined,
      consent: body.consent === true,
      jointInviteEmail:
        typeof body.jointInviteEmail === 'string' ? body.jointInviteEmail.slice(0, MAX_FIELD) : undefined,
    });
    if (!result.ok || !result.value) {
      return invalid(reply, 'Please correct the highlighted fields.', result.errors as Record<string, string>);
    }

    const submitted = await submitApplication(result.value, await simulationNow(prisma));
    // Feed the live operations queue + simulated-event feed (operators room only).
    app.opsRealtime.requestChanged('created', submitted.request);
    for (const event of submitted.events) app.opsRealtime.externalEvent(event);

    const response: OpenAccountResponse = {
      reference: submitted.reference,
      status: 'submitted',
      product: result.value.product,
      message:
        'Your simulated application was received. A bank operator will review it; once approved, you can sign in with the email and password you chose. (SIMULATION — no real account, money, or identity check.)',
    };
    return reply.code(201).send(response);
  });

  // ---- Owner: invite a joint owner to an account ----------------------------
  app.post('/api/accounts/:id/invitations', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user!;
    const { id } = req.params as { id: string };

    const account = await prisma.account.findUnique({ where: { id }, select: { id: true, name: true } });
    const relationship = account ? await getAccountRelationship(prisma, user.id, id) : null;
    if (!account || !relationship) {
      return reply
        .code(account ? 403 : 404)
        .send({ error: 'That account was not found.', code: account ? 'forbidden' : 'not_found' } satisfies ApiErrorResponse);
    }
    if (relationship !== 'owner') {
      return reply
        .code(403)
        .send({ error: 'Only the account owner can invite a joint owner.', code: 'forbidden' } satisfies ApiErrorResponse);
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateInvitation(
      {
        inviteeEmail: typeof body.inviteeEmail === 'string' ? body.inviteeEmail.slice(0, MAX_FIELD) : undefined,
        relationship: body.relationship === 'authorized' ? 'authorized' : undefined,
      },
      user.email,
    );
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please enter a valid email to invite.', check.errors as Record<string, string>);
    }

    const { invitation, event } = await inviteJoint(
      {
        accountId: id,
        accountName: account.name,
        inviter: user,
        inviteeEmail: check.value.inviteeEmail,
        relationship: check.value.relationship,
      },
      await simulationNow(prisma),
    );
    app.opsRealtime.externalEvent(event); // the simulated "invitation sent" email
    return reply.code(201).send({ invitation });
  });

  // ---- Auth: my pending invitations -----------------------------------------
  app.get('/api/invitations', { preHandler: requireAuth }, async (req, reply) => {
    const invitations = await listInvitationsForUser(req.user!);
    return reply.send({ invitations });
  });

  app.post('/api/invitations/:id/accept', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const invitation = await acceptInvitation(id, req.user!, await simulationNow(prisma));
      return reply.send({ invitation } satisfies { invitation: AccountInvitationDTO });
    } catch (err) {
      return handleInvitationError(reply, err);
    }
  });

  app.post('/api/invitations/:id/decline', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const invitation = await declineInvitation(id, req.user!, await simulationNow(prisma));
      return reply.send({ invitation } satisfies { invitation: AccountInvitationDTO });
    } catch (err) {
      return handleInvitationError(reply, err);
    }
  });
}

function handleInvitationError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof InvitationError) {
    const code =
      err.code === 'not_found'
        ? 404
        : err.code === 'wrong_invitee' || err.code === 'forbidden'
          ? 403
          : 409;
    return reply.code(code).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
  }
  throw err;
}
