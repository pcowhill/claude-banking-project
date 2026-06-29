import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  validateExternalMovement,
  validateTransfer,
  type ApiErrorResponse,
  type ExternalMovementResponse,
  type TransferResponse,
} from '@simbank/shared';
import { requireAuth } from '../auth/guards';
import { createExternalMovement, createTransfer, MovementError, type MovementErrorCode } from '../money/movements';
import { prisma } from '../db';
import { simulationNow } from '../clock/clock';

/**
 * Customer money-movement endpoints (v0.7.0). Both are authenticated and scoped
 * to the caller's own accounts (the service re-checks access per account).
 *
 *  - `POST /api/transfers` — an IMMEDIATE transfer between the user's own
 *    accounts. Posts both `transfer` legs (nets to zero); no operator review.
 *  - `POST /api/movements` — a REVIEWABLE external movement (mobile check
 *    deposit / external ACH / wire / bill pay). Writes a PENDING ledger entry +
 *    a linked ops queue item, pushed live to operators. Nothing posts until an
 *    operator approves it.
 *
 * SIMULATION: no real money network, biller, or external account is ever
 * contacted. Money moves only via ledger entries; balances stay derived.
 */

const MAX_FIELD = 500;

function movementHttpStatus(code: MovementErrorCode): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    case 'nothing_to_reverse':
      return 409;
    default:
      return 400; // insufficient_funds | inactive_account | invalid | not_a_movement
  }
}

function handleMovementError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof MovementError) {
    return reply
      .code(movementHttpStatus(err.code))
      .send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
  }
  throw err;
}

function invalid(reply: FastifyReply, error: string, fields?: Record<string, string>): void {
  reply.code(400).send({ error, code: 'invalid_request', fields } as ApiErrorResponse & {
    fields?: Record<string, string>;
  });
}

export async function moneyRoutes(app: FastifyInstance): Promise<void> {
  // ---- Internal transfer (immediate; both legs) -----------------------------
  app.post('/api/transfers', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateTransfer({
      fromAccountId: typeof body.fromAccountId === 'string' ? body.fromAccountId.slice(0, MAX_FIELD) : undefined,
      toAccountId: typeof body.toAccountId === 'string' ? body.toAccountId.slice(0, MAX_FIELD) : undefined,
      amountMinor: typeof body.amountMinor === 'number' ? body.amountMinor : undefined,
      memo: typeof body.memo === 'string' ? body.memo.slice(0, MAX_FIELD) : undefined,
    });
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please correct the highlighted fields.', check.errors as Record<string, string>);
    }
    try {
      const result = await createTransfer(req.user!, check.value, await simulationNow(prisma));
      const response: TransferResponse = {
        ok: true,
        message: 'Transfer posted (simulated). Both accounts have been updated.',
        amountMinor: result.amountMinor,
        accounts: result.accounts,
      };
      return reply.code(201).send(response);
    } catch (err) {
      return handleMovementError(reply, err);
    }
  });

  // ---- External reviewable movement (queues for operator review) ------------
  app.post('/api/movements', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateExternalMovement({
      accountId: typeof body.accountId === 'string' ? body.accountId.slice(0, MAX_FIELD) : undefined,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      amountMinor: typeof body.amountMinor === 'number' ? body.amountMinor : undefined,
      direction: typeof body.direction === 'string' ? body.direction : undefined,
      counterparty: typeof body.counterparty === 'string' ? body.counterparty.slice(0, MAX_FIELD) : undefined,
      memo: typeof body.memo === 'string' ? body.memo.slice(0, MAX_FIELD) : undefined,
    });
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please correct the highlighted fields.', check.errors as Record<string, string>);
    }
    try {
      const created = await createExternalMovement(req.user!, check.value, await simulationNow(prisma));
      // Feed the live operations queue + simulated-event feed (operators room only).
      app.opsRealtime.requestChanged('created', created.request);
      for (const event of created.events) app.opsRealtime.externalEvent(event);

      const response: ExternalMovementResponse = {
        reference: created.reference,
        kind: check.value.kind,
        status: 'pending_review',
        amountMinor: check.value.amountMinor,
        direction: check.value.direction,
        message:
          'Your simulated movement was submitted and is awaiting operator review. It will appear as “Pending” until an operator posts it. (SIMULATION — no real money network was contacted.)',
      };
      return reply.code(201).send(response);
    } catch (err) {
      return handleMovementError(reply, err);
    }
  });
}
