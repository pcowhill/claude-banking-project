import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  validateLoanPayment,
  validateOpenCd,
  validateOpenLoan,
  validateWithdrawCd,
  type ApiErrorResponse,
  type LendingListResponse,
  type LendingProductResponse,
} from '@simbank/shared';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/guards';
import { simulationNow } from '../clock/clock';
import {
  LendingError,
  listAllLending,
  listLendingForUser,
  makeLoanPayment,
  openCd,
  openLoan,
  withdrawMaturedCd,
  type LendingErrorCode,
} from '../lending/lending';

/**
 * Customer lending & deposit endpoints (v1.0.0): open a CD, open a loan, make a
 * loan payment, withdraw a matured CD, and list the caller's products. All
 * authenticated and access-scoped (the service re-checks access per account).
 *
 * MONEY DISCIPLINE: every action moves money only via net-zero `transfer` leg
 * pairs through the ledger; interest is accrued by the clock-driven accrual driver
 * as bank-originated `interest` entries. Balances stay derived. SIMULATION only.
 */

function lendingHttpStatus(code: LendingErrorCode): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    default:
      return 400; // insufficient_funds | inactive_account | invalid_state | not_matured
  }
}

function handleLendingError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof LendingError) {
    return reply.code(lendingHttpStatus(err.code)).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
  }
  throw err;
}

function invalid(reply: FastifyReply, fields: Record<string, string>): void {
  reply.code(400).send({ error: 'Please correct the highlighted fields.', code: 'invalid_request', fields } as ApiErrorResponse & {
    fields?: Record<string, string>;
  });
}

export async function lendingRoutes(app: FastifyInstance): Promise<void> {
  // ---- List the caller's lending products -----------------------------------
  app.get('/api/lending', { preHandler: requireAuth }, async (req, reply) => {
    const products = await listLendingForUser(req.user!);
    return reply.send({ products } satisfies LendingListResponse);
  });

  // ---- Open a CD ------------------------------------------------------------
  app.post('/api/lending/cds', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateOpenCd({
      fundingAccountId: typeof body.fundingAccountId === 'string' ? body.fundingAccountId : undefined,
      principalMinor: typeof body.principalMinor === 'number' ? body.principalMinor : undefined,
      termMonths: typeof body.termMonths === 'number' ? body.termMonths : undefined,
    });
    if (!check.ok || !check.value) return invalid(reply, check.errors as Record<string, string>);
    try {
      const product = await openCd(req.user!, check.value, await simulationNow(prisma));
      return reply.code(201).send({ product, message: 'Your CD is open (simulated).' } satisfies LendingProductResponse);
    } catch (err) {
      return handleLendingError(reply, err);
    }
  });

  // ---- Open a loan ----------------------------------------------------------
  app.post('/api/lending/loans', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateOpenLoan({
      disbursementAccountId: typeof body.disbursementAccountId === 'string' ? body.disbursementAccountId : undefined,
      principalMinor: typeof body.principalMinor === 'number' ? body.principalMinor : undefined,
      termMonths: typeof body.termMonths === 'number' ? body.termMonths : undefined,
    });
    if (!check.ok || !check.value) return invalid(reply, check.errors as Record<string, string>);
    try {
      const product = await openLoan(req.user!, check.value, await simulationNow(prisma));
      return reply.code(201).send({ product, message: 'Your loan is funded (simulated).' } satisfies LendingProductResponse);
    } catch (err) {
      return handleLendingError(reply, err);
    }
  });

  // ---- Make a loan payment --------------------------------------------------
  app.post('/api/lending/loans/:id/pay', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateLoanPayment({
      fromAccountId: typeof body.fromAccountId === 'string' ? body.fromAccountId : undefined,
      amountMinor: typeof body.amountMinor === 'number' ? body.amountMinor : undefined,
    });
    if (!check.ok || !check.value) return invalid(reply, check.errors as Record<string, string>);
    try {
      const product = await makeLoanPayment(req.user!, id, check.value, await simulationNow(prisma));
      return reply.send({ product, message: 'Payment posted (simulated).' } satisfies LendingProductResponse);
    } catch (err) {
      return handleLendingError(reply, err);
    }
  });

  // ---- Withdraw a matured CD ------------------------------------------------
  app.post('/api/lending/cds/:id/withdraw', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateWithdrawCd({ toAccountId: typeof body.toAccountId === 'string' ? body.toAccountId : undefined });
    if (!check.ok || !check.value) return invalid(reply, check.errors as Record<string, string>);
    try {
      const product = await withdrawMaturedCd(req.user!, id, check.value.toAccountId, await simulationNow(prisma));
      return reply.send({ product, message: 'Your matured CD proceeds were transferred (simulated).' } satisfies LendingProductResponse);
    } catch (err) {
      return handleLendingError(reply, err);
    }
  });

  // ---- Operator/admin: all lending products ---------------------------------
  app.get('/api/ops/lending', { preHandler: [requireAuth, requireRole('ops_agent', 'admin')] }, async (_req, reply) => {
    const products = await listAllLending();
    return reply.send({ products } satisfies LendingListResponse);
  });
}
