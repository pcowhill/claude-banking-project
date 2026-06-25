import type { PrismaClient } from '@prisma/client';
import {
  deriveBalances,
  filterTransactions,
  toTransactionDTOs,
  type AccountRelationship,
  type AccountStatus,
  type AccountSummary,
  type AccountType,
  type LedgerDirection,
  type LedgerOrigin,
  type LedgerStatus,
  type RawLedgerRow,
  type TransactionDTO,
  type TransactionQuery,
} from '@simbank/shared';

/**
 * Account-level access control — the enforcement point for "customers see only
 * their own accounts; joint users only authorized accounts."
 *
 * Access is granted by `AccountAccess` rows (the seed gives every owner an
 * `owner` row and joint/authorized users their own rows). Ownership recorded on
 * `Account.userId` is honored as a defensive fallback so an account created
 * without an explicit grant is never silently orphaned from its owner.
 */

interface LedgerRow {
  amountMinor: number;
  direction: string;
  status: string;
}

function toSummary(
  account: {
    id: string;
    name: string;
    type: string;
    status: string;
    currency: string;
    ledgerEntries: LedgerRow[];
  },
  relationship: AccountRelationship,
): AccountSummary {
  const balances = deriveBalances(
    account.ledgerEntries.map((e) => ({
      amountMinor: e.amountMinor,
      direction: e.direction as LedgerDirection,
      status: e.status as LedgerStatus,
    })),
  );
  return {
    id: account.id,
    name: account.name,
    type: account.type as AccountType,
    status: account.status as AccountStatus,
    currency: account.currency,
    relationship,
    balances,
  };
}

/**
 * The caller's relationship to an account, or null if they may not see it.
 * `null` for both "no such account" and "exists but not yours" — the caller
 * decides which HTTP status to surface.
 */
export async function getAccountRelationship(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
): Promise<AccountRelationship | null> {
  const grant = await prisma.accountAccess.findUnique({
    where: { userId_accountId: { userId, accountId } },
  });
  if (grant) return grant.relationship as AccountRelationship;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });
  if (account && account.userId === userId) return 'owner';
  return null;
}

/** A single accessible account (with derived balances) or null if forbidden. */
export async function getAccessibleAccount(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
): Promise<{ summary: AccountSummary | null; exists: boolean }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { ledgerEntries: true },
  });
  if (!account) return { summary: null, exists: false };

  const relationship = await getAccountRelationship(prisma, userId, accountId);
  if (!relationship) return { summary: null, exists: true };
  return { summary: toSummary(account, relationship), exists: true };
}

/** Every account the user may see, owner rows and access grants merged. */
export async function listAccessibleAccounts(
  prisma: PrismaClient,
  userId: string,
): Promise<AccountSummary[]> {
  const grants = await prisma.accountAccess.findMany({
    where: { userId },
    include: { account: { include: { ledgerEntries: true } } },
  });

  // Map accountId -> relationship, seeded from explicit grants.
  const relationshipById = new Map<string, AccountRelationship>();
  const accountById = new Map<string, (typeof grants)[number]['account']>();
  for (const grant of grants) {
    relationshipById.set(grant.accountId, grant.relationship as AccountRelationship);
    accountById.set(grant.accountId, grant.account);
  }

  // Defensive fallback: include owned accounts lacking an explicit grant.
  const owned = await prisma.account.findMany({
    where: { userId },
    include: { ledgerEntries: true },
  });
  for (const account of owned) {
    if (!relationshipById.has(account.id)) {
      relationshipById.set(account.id, 'owner');
      accountById.set(account.id, account);
    }
  }

  return [...accountById.entries()]
    .map(([id, account]) => toSummary(account, relationshipById.get(id) as AccountRelationship))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A ledger row from Prisma, narrowed to what the transaction view needs. */
interface LedgerEntryRow {
  id: string;
  accountId: string;
  amountMinor: number;
  direction: string;
  status: string;
  origin: string;
  description: string;
  postedAt: Date | null;
  createdAt: Date;
}

/** Convert a persisted ledger row to the pure {@link RawLedgerRow} shape (ISO dates). */
function toRawLedgerRow(entry: LedgerEntryRow): RawLedgerRow {
  return {
    id: entry.id,
    accountId: entry.accountId,
    amountMinor: entry.amountMinor,
    direction: entry.direction as LedgerDirection,
    status: entry.status as LedgerStatus,
    origin: entry.origin as LedgerOrigin,
    description: entry.description,
    postedAt: entry.postedAt ? entry.postedAt.toISOString() : null,
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * The account header + its transaction history, scoped by the SAME access rules
 * as a single-account read: `exists=false` → 404, `summary=null` (exists but no
 * relationship) → 403, otherwise the caller sees the account and its rows.
 *
 * Transactions are derived (newest-first, signed amounts, running settled
 * balance) by the shared `toTransactionDTOs`, then narrowed by an optional
 * search/filter via the shared `filterTransactions` — one definition reused by
 * the API and the frontend. Balances remain DERIVED; nothing is stored.
 */
export async function listAccountTransactions(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  query: TransactionQuery = {},
): Promise<{ exists: boolean; summary: AccountSummary | null; transactions: TransactionDTO[] }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { ledgerEntries: true },
  });
  if (!account) return { exists: false, summary: null, transactions: [] };

  const relationship = await getAccountRelationship(prisma, userId, accountId);
  if (!relationship) return { exists: true, summary: null, transactions: [] };

  const summary = toSummary(account, relationship);
  const all = toTransactionDTOs(account.ledgerEntries.map(toRawLedgerRow));
  const transactions = filterTransactions(all, query);
  return { exists: true, summary, transactions };
}
