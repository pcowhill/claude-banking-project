import type { FastifyInstance } from 'fastify';
import {
  LEDGER_ORIGINS,
  type AccountStatementsResponse,
  type AccountTransactionsResponse,
  type ApiErrorResponse,
  type LedgerOrigin,
  type TransactionGroup,
  type TransactionQuery,
} from '@simbank/shared';
import { prisma } from '../db';
import {
  getAccessibleAccount,
  getAccountStatements,
  listAccessibleAccounts,
  listAccountTransactions,
} from '../auth/access';
import { requireAuth } from '../auth/guards';
import { simulationNow } from '../clock/clock';

const TRANSACTION_GROUPS: readonly TransactionGroup[] = ['pending', 'posted', 'other'];

/** Parse + validate the `?q=&group=&origin=` query into a safe TransactionQuery. */
function parseTransactionQuery(raw: { q?: string; group?: string; origin?: string }): TransactionQuery {
  const query: TransactionQuery = {};
  if (typeof raw.q === 'string' && raw.q.trim()) query.q = raw.q.trim();
  if (raw.group && (TRANSACTION_GROUPS as readonly string[]).includes(raw.group)) {
    query.group = raw.group as TransactionGroup;
  }
  if (raw.origin && (LEDGER_ORIGINS as readonly string[]).includes(raw.origin)) {
    query.origin = raw.origin as LedgerOrigin;
  }
  return query;
}

/**
 * Customer account endpoints. Every read is scoped to what the authenticated
 * user is allowed to see: owners see their accounts, joint/authorized users see
 * only the shared accounts granted to them, and nobody can read an account they
 * have no relationship to. Balances are DERIVED on the server from the ledger.
 */
export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/accounts', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated.', code: 'unauthenticated' });
    const accounts = await listAccessibleAccounts(prisma, user.id);
    return reply.send({ accounts });
  });

  app.get('/api/accounts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated.', code: 'unauthenticated' });
    const { id } = req.params as { id: string };

    const { summary, exists } = await getAccessibleAccount(prisma, user.id, id);
    if (!exists) {
      return reply.code(404).send({ error: 'Account not found.', code: 'not_found' } satisfies ApiErrorResponse);
    }
    if (!summary) {
      // The account exists but the caller has no relationship to it.
      return reply
        .code(403)
        .send({ error: 'You do not have access to this account.', code: 'forbidden' } satisfies ApiErrorResponse);
    }
    return reply.send({ account: summary });
  });

  // Transaction history for one account. Scoped by the SAME access rules as the
  // single-account read above (404 if no such account, 403 if the caller has no
  // relationship to it). Supports `?q=&group=&origin=` search/filter. Balances
  // and the running balance are DERIVED on the server from the ledger.
  app.get('/api/accounts/:id/transactions', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated.', code: 'unauthenticated' });
    const { id } = req.params as { id: string };
    const query = parseTransactionQuery(req.query as { q?: string; group?: string; origin?: string });

    const { exists, summary, transactions } = await listAccountTransactions(prisma, user.id, id, query);
    if (!exists) {
      return reply.code(404).send({ error: 'Account not found.', code: 'not_found' } satisfies ApiErrorResponse);
    }
    if (!summary) {
      return reply
        .code(403)
        .send({ error: 'You do not have access to this account.', code: 'forbidden' } satisfies ApiErrorResponse);
    }
    return reply.send({ account: summary, transactions } satisfies AccountTransactionsResponse);
  });

  // Monthly statement periods for one account, ending at the current SIMULATION
  // date. Same access rules (404 / 403). Each period's figures are DERIVED
  // read-only from the posted ledger — no stored statement, no real PDF.
  app.get('/api/accounts/:id/statements', { preHandler: requireAuth }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.code(401).send({ error: 'Not authenticated.', code: 'unauthenticated' });
    const { id } = req.params as { id: string };

    const now = await simulationNow(prisma);
    const { exists, summary, periods } = await getAccountStatements(prisma, user.id, id, now);
    if (!exists) {
      return reply.code(404).send({ error: 'Account not found.', code: 'not_found' } satisfies ApiErrorResponse);
    }
    if (!summary) {
      return reply
        .code(403)
        .send({ error: 'You do not have access to this account.', code: 'forbidden' } satisfies ApiErrorResponse);
    }
    return reply.send({ accountId: id, asOf: now.toISOString(), periods } satisfies AccountStatementsResponse);
  });
}
