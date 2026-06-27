import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  validateIssueCard,
  validateReportCard,
  validateTravelNotice,
  type ApiErrorResponse,
  type CardListResponse,
  type CardResponse,
  type ReplaceCardResponse,
} from '@simbank/shared';
import { requireAuth } from '../auth/guards';
import {
  addTravelNotice,
  cancelTravelNotice,
  CardError,
  freezeCard,
  issueCard,
  listAccountCards,
  listCards,
  reportCard,
  unfreezeCard,
  type CardErrorCode,
} from '../cards/cards';

/**
 * Customer card-lifecycle endpoints (v0.8.0). All authenticated and scoped to
 * accounts the caller can access (the service re-checks access per card/account).
 * SIMULATION: card lifecycle moves NO money — these never touch the ledger.
 */

const MAX_FIELD = 200;

function cardHttpStatus(code: CardErrorCode): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    default:
      return 400; // inactive_account | invalid_state
  }
}

function handleCardError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof CardError) {
    return reply.code(cardHttpStatus(err.code)).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
  }
  throw err;
}

function invalid(reply: FastifyReply, error: string, fields?: Record<string, string>): void {
  reply.code(400).send({ error, code: 'invalid_request', fields } as ApiErrorResponse & {
    fields?: Record<string, string>;
  });
}

export async function cardRoutes(app: FastifyInstance): Promise<void> {
  // ---- List the caller's cards ----------------------------------------------
  app.get('/api/cards', { preHandler: requireAuth }, async (req, reply) => {
    const cards = await listCards(req.user!);
    return reply.send({ cards } satisfies CardListResponse);
  });

  // ---- Cards on a single account --------------------------------------------
  app.get('/api/accounts/:id/cards', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const cards = await listAccountCards(req.user!, id);
      return reply.send({ cards } satisfies CardListResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });

  // ---- Issue a card on an account -------------------------------------------
  app.post('/api/accounts/:id/cards', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateIssueCard({
      cardType: typeof body.cardType === 'string' ? body.cardType : undefined,
      network: typeof body.network === 'string' ? body.network : undefined,
    });
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please correct the highlighted fields.', check.errors as Record<string, string>);
    }
    try {
      const card = await issueCard(req.user!, id, check.value, new Date());
      return reply.code(201).send({ card } satisfies CardResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });

  // ---- Freeze / unfreeze ----------------------------------------------------
  app.post('/api/cards/:id/freeze', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const card = await freezeCard(req.user!, id, new Date());
      return reply.send({ card } satisfies CardResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });

  app.post('/api/cards/:id/unfreeze', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const card = await unfreezeCard(req.user!, id, new Date());
      return reply.send({ card } satisfies CardResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });

  // ---- Report lost / stolen → replacement -----------------------------------
  app.post('/api/cards/:id/report', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateReportCard({ reason: typeof body.reason === 'string' ? body.reason : undefined });
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please correct the highlighted fields.', check.errors as Record<string, string>);
    }
    try {
      const result = await reportCard(req.user!, id, check.value.reason, new Date());
      return reply.code(201).send({ card: result.card, replaced: result.replaced } satisfies ReplaceCardResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });

  // ---- Travel notices -------------------------------------------------------
  app.post('/api/cards/:id/travel-notices', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateTravelNotice({
      destination: typeof body.destination === 'string' ? body.destination.slice(0, MAX_FIELD) : undefined,
      startsOn: typeof body.startsOn === 'string' ? body.startsOn : undefined,
      endsOn: typeof body.endsOn === 'string' ? body.endsOn : undefined,
      note: typeof body.note === 'string' ? body.note.slice(0, MAX_FIELD) : undefined,
    });
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please correct the highlighted fields.', check.errors as Record<string, string>);
    }
    try {
      const card = await addTravelNotice(req.user!, id, check.value, new Date());
      return reply.code(201).send({ card } satisfies CardResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });

  app.post('/api/cards/:id/travel-notices/:noticeId/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id, noticeId } = req.params as { id: string; noticeId: string };
    try {
      const card = await cancelTravelNotice(req.user!, id, noticeId);
      return reply.send({ card } satisfies CardResponse);
    } catch (err) {
      return handleCardError(reply, err);
    }
  });
}
