import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  isFraudResponse,
  validateDispute,
  type ApiErrorResponse,
  type DisputeResponse,
  type FraudAlertListResponse,
} from '@simbank/shared';
import { requireAuth } from '../auth/guards';
import { createDispute, DisputeError, type DisputeErrorCode } from '../risk/disputes';
import { FraudError, listFraudAlertsForUser, respondToFraudAlert, type FraudErrorCode } from '../risk/fraud';

/**
 * Customer fraud + dispute endpoints (v0.8.0). All authenticated and scoped to
 * the caller (a dispute is checked against access to the transaction's account; a
 * fraud-alert response is checked against the alert's subject). Both feed the
 * v0.5.0 operations queue and push live to the operators room.
 *
 * MONEY DISCIPLINE: filing a dispute flags the entry `disputed` (a ledger status
 * change, not a balance edit). The operator's resolution does the reversal/restore.
 */

const MAX_FIELD = 400;

function disputeHttpStatus(code: DisputeErrorCode): number {
  return code === 'not_found' ? 404 : code === 'forbidden' ? 403 : 400;
}
function fraudHttpStatus(code: FraudErrorCode): number {
  return code === 'not_found' ? 404 : code === 'forbidden' ? 403 : 400;
}

export async function riskRoutes(app: FastifyInstance): Promise<void> {
  // ---- File a dispute against a posted transaction --------------------------
  app.post('/api/disputes', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateDispute({
      ledgerEntryId: typeof body.ledgerEntryId === 'string' ? body.ledgerEntryId.slice(0, MAX_FIELD) : undefined,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      details: typeof body.details === 'string' ? body.details.slice(0, MAX_FIELD) : undefined,
    });
    if (!check.ok || !check.value) {
      return reply.code(400).send({
        error: 'Please correct the highlighted fields.',
        code: 'invalid_request',
        fields: check.errors,
      } as ApiErrorResponse & { fields?: Record<string, string> });
    }
    try {
      const created = await createDispute(req.user!, check.value, new Date());
      app.opsRealtime.requestChanged('created', created.request);
      for (const event of created.events) app.opsRealtime.externalEvent(event);
      return reply.code(201).send({
        ok: true,
        message:
          'Your dispute was filed (simulated). The transaction is now flagged as disputed and is under operator review.',
        requestId: created.request.id,
      } satisfies DisputeResponse);
    } catch (err) {
      if (err instanceof DisputeError) {
        return handle(reply, disputeHttpStatus(err.code), err.message, err.code);
      }
      throw err;
    }
  });

  // ---- The customer's pending fraud alerts ----------------------------------
  app.get('/api/fraud-alerts', { preHandler: requireAuth }, async (req, reply) => {
    const alerts = await listFraudAlertsForUser(req.user!);
    return reply.send({ alerts } satisfies FraudAlertListResponse);
  });

  // ---- Confirm / deny a fraud alert -----------------------------------------
  app.post('/api/fraud-alerts/:id/respond', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isFraudResponse(body.response)) {
      return handle(reply, 400, 'A valid response (confirm_legit | report_fraud) is required.', 'bad_request');
    }
    try {
      const result = await respondToFraudAlert(req.user!, id, body.response, new Date());
      app.opsRealtime.requestChanged('updated', result.request);
      for (const event of result.events) app.opsRealtime.externalEvent(event);
      return reply.send({ request: result.request });
    } catch (err) {
      if (err instanceof FraudError) {
        return handle(reply, fraudHttpStatus(err.code), err.message, err.code);
      }
      throw err;
    }
  });
}

function handle(reply: FastifyReply, code: number, error: string, errCode: string): FastifyReply {
  return reply.code(code).send({ error, code: errCode } satisfies ApiErrorResponse);
}
