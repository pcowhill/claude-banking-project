import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/guards';

/**
 * Operations & admin endpoints, gated by role.
 *
 *  - `/api/ops/summary` (ops_agent or admin): a small operational snapshot used
 *    by the operations console once a real operator is signed in.
 *  - `/api/admin/users` (admin only): the demo-user roster, deliberately
 *    WITHOUT password hashes or session tokens.
 *
 * Customers receive 403 from both — the access-control demonstration for the
 * non-customer roles.
 */
export async function opsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/ops/summary',
    { preHandler: [requireAuth, requireRole('ops_agent', 'admin')] },
    async (_req, reply) => {
      const now = new Date();
      const [users, accounts, pendingRequests, lockedAccounts] = await Promise.all([
        prisma.user.count(),
        prisma.account.count(),
        prisma.operationsRequest.count({ where: { status: 'pending' } }),
        prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      ]);
      return reply.send({ users, accounts, pendingRequests, lockedAccounts });
    },
  );

  app.get(
    '/api/admin/users',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (_req, reply) => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          lastLoginAt: true,
          failedLoginAttempts: true,
          lockedUntil: true,
          createdAt: true,
        },
      });
      return reply.send({
        users: users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
          createdAt: u.createdAt.toISOString(),
        })),
      });
    },
  );
}
