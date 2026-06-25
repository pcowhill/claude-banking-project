import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@simbank/shared';
import { prisma } from '../db';
import { getAccessibleAccount, listAccessibleAccounts } from '../auth/access';
import { requireAuth } from '../auth/guards';

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
}
