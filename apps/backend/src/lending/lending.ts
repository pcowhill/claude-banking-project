import type { Account, LendingProduct } from '@prisma/client';
import {
  addMonthsClamped,
  deriveBalances,
  formatMinor,
  LENDING_KIND_LABELS,
  type LedgerDirection,
  type LedgerStatus,
  type LendingKind,
  type LendingProductDTO,
  type LendingStatus,
  type NormalizedOpenCd,
  type NormalizedOpenLoan,
  type NormalizedLoanPayment,
  type SessionUser,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { getAccountRelationship } from '../auth/access';

/**
 * Lending & deposit services (v1.0.0) — open a CD, open a loan, make a loan
 * payment, withdraw a matured CD. Clock-driven INTEREST ACCRUAL lives in
 * `accrual.ts`. Both build on the disciplined ledger and the simulation clock.
 *
 * MONEY DISCIPLINE (enforced here, asserted in tests):
 *  - Opening a CD / disbursing a loan / paying a loan / withdrawing a CD each post
 *    a PAIR of `transfer` legs (same amount, same instant) so the movement NETS TO
 *    ZERO across the two accounts — money is only ever relocated, never minted.
 *  - The only money that ENTERS the system for these products is bank-originated
 *    `interest` (see `accrual.ts`), exactly as the constitution allows.
 *  - A loan account simply carries a NEGATIVE derived balance (the amount owed);
 *    nothing stores or edits a balance. Balances stay DERIVED from the ledger.
 *  - The acting principal is always the caller, and access is checked with the
 *    same primitive the rest of the app uses — a customer can only act on accounts
 *    they already hold (owner/joint/authorized, never viewer).
 *
 * SIMULATION: there is no real lender, depositor, credit decision, or money
 * network — only fake, seeded/operator/customer-driven ledger entries.
 */

export type LendingErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'insufficient_funds'
  | 'inactive_account'
  | 'invalid_state'
  | 'not_matured';

export class LendingError extends Error {
  readonly code: LendingErrorCode;
  constructor(code: LendingErrorCode, message: string) {
    super(message);
    this.name = 'LendingError';
    this.code = code;
  }
}

const MOVABLE = new Set(['owner', 'joint', 'authorized']);

interface BalanceRow {
  amountMinor: number;
  direction: string;
  status: string;
}

function deriveFrom(rows: BalanceRow[]) {
  return deriveBalances(
    rows.map((e) => ({
      amountMinor: e.amountMinor,
      direction: e.direction as LedgerDirection,
      status: e.status as LedgerStatus,
    })),
  );
}

/** The caller must be able to MOVE money on `accountId` (non-viewer, active). */
async function requireMovable(userId: string, accountId: string): Promise<Account> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new LendingError('not_found', 'That account was not found.');
  const relationship = await getAccountRelationship(prisma, userId, accountId);
  if (!relationship || !MOVABLE.has(relationship)) {
    throw new LendingError('forbidden', 'You cannot use that account.');
  }
  if (account.status !== 'active') {
    throw new LendingError('inactive_account', 'That account is not active.');
  }
  return account;
}

/** Current DERIVED available balance for an account (uses the live ledger). */
async function availableMinor(db: DbClient, accountId: string): Promise<number> {
  const entries = await db.ledgerEntry.findMany({
    where: { accountId },
    select: { amountMinor: true, direction: true, status: true },
  });
  return deriveFrom(entries).availableMinor;
}

/** Current DERIVED settled (posted/disputed) balance for an account. */
async function currentMinor(db: DbClient, accountId: string): Promise<number> {
  const entries = await db.ledgerEntry.findMany({
    where: { accountId },
    select: { amountMinor: true, direction: true, status: true },
  });
  return deriveFrom(entries).currentMinor;
}

/** Public alias of the derived settled balance (used by the accrual driver). */
export function accountCurrentMinor(db: DbClient, accountId: string): Promise<number> {
  return currentMinor(db, accountId);
}

/**
 * Post a NET-ZERO pair of `transfer` legs: debit `fromAccountId`, credit
 * `toAccountId`, same amount + instant. No funds check here — the caller decides
 * (a loan disbursement deliberately drives the loan account negative). Money
 * discipline: the pair conserves the system settled total exactly.
 */
async function postTransferPair(
  tx: DbClient,
  args: {
    fromAccountId: string;
    toAccountId: string;
    amountMinor: number;
    fromDescription: string;
    toDescription: string;
    now: Date;
  },
): Promise<void> {
  await tx.ledgerEntry.create({
    data: {
      accountId: args.fromAccountId,
      amountMinor: args.amountMinor,
      direction: 'debit',
      status: 'posted',
      origin: 'transfer',
      description: args.fromDescription,
      postedAt: args.now,
      createdAt: args.now,
    },
  });
  await tx.ledgerEntry.create({
    data: {
      accountId: args.toAccountId,
      amountMinor: args.amountMinor,
      direction: 'credit',
      status: 'posted',
      origin: 'transfer',
      description: args.toDescription,
      postedAt: args.now,
      createdAt: args.now,
    },
  });
}

// ---- DTO mapping ------------------------------------------------------------

export async function toLendingProductDTO(
  db: DbClient,
  product: LendingProduct,
  account: Pick<Account, 'id' | 'name'>,
): Promise<LendingProductDTO> {
  const balanceMinor = await currentMinor(db, product.accountId);
  return {
    id: product.id,
    kind: product.kind as LendingKind,
    status: product.status as LendingStatus,
    accountId: product.accountId,
    accountName: account.name,
    apyBps: product.apyBps,
    termMonths: product.termMonths,
    principalMinor: product.principalMinor,
    paymentMinor: product.paymentMinor,
    openedAt: product.openedAt.toISOString(),
    maturesAt: product.maturesAt.toISOString(),
    lastAccruedAt: product.lastAccruedAt.toISOString(),
    balanceMinor,
    outstandingMinor: balanceMinor < 0 ? -balanceMinor : 0,
  };
}

// ---- Open a CD --------------------------------------------------------------

export async function openCd(
  user: SessionUser,
  input: NormalizedOpenCd,
  now: Date,
): Promise<LendingProductDTO> {
  const funding = await requireMovable(user.id, input.fundingAccountId);
  if ((await availableMinor(prisma, funding.id)) < input.principalMinor) {
    throw new LendingError('insufficient_funds', 'That deposit exceeds the available balance.');
  }

  const maturesAt = addMonthsClamped(now, input.termMonths);
  const name = `${input.termMonths}-month CD`;

  const { product, account } = await prisma.$transaction(async (tx) => {
    const cdAccount = await tx.account.create({
      data: { userId: user.id, type: 'cd', name, status: 'active', openedAt: now, createdAt: now },
    });
    await tx.accountAccess.create({
      data: { userId: user.id, accountId: cdAccount.id, relationship: 'owner', createdAt: now },
    });
    await postTransferPair(tx, {
      fromAccountId: funding.id,
      toAccountId: cdAccount.id,
      amountMinor: input.principalMinor,
      fromDescription: `Opening deposit — ${name}`,
      toDescription: `CD opening deposit from ${funding.name}`,
      now,
    });
    const created = await tx.lendingProduct.create({
      data: {
        accountId: cdAccount.id,
        kind: 'cd',
        status: 'active',
        principalMinor: input.principalMinor,
        apyBps: input.apyBps,
        termMonths: input.termMonths,
        paymentMinor: null,
        openedAt: now,
        maturesAt,
        lastAccruedAt: now,
      },
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'lending_open_cd',
      entity: 'lending_product',
      entityId: created.id,
      reason: `Opened a ${name} for ${formatMinor(input.principalMinor)} at ${input.apyBps / 100}% APY (simulated)`,
      metadata: { accountId: cdAccount.id, fundingAccountId: funding.id, apyBps: input.apyBps, termMonths: input.termMonths, actorName: user.displayName },
    });
    return { product: created, account: cdAccount };
  });

  return toLendingProductDTO(prisma, product, account);
}

// ---- Open a loan ------------------------------------------------------------

export async function openLoan(
  user: SessionUser,
  input: NormalizedOpenLoan,
  now: Date,
): Promise<LendingProductDTO> {
  const disbursement = await requireMovable(user.id, input.disbursementAccountId);

  const maturesAt = addMonthsClamped(now, input.termMonths);
  const name = `Personal loan`;

  const { product, account } = await prisma.$transaction(async (tx) => {
    const loanAccount = await tx.account.create({
      data: { userId: user.id, type: 'loan', name, status: 'active', openedAt: now, createdAt: now },
    });
    await tx.accountAccess.create({
      data: { userId: user.id, accountId: loanAccount.id, relationship: 'owner', createdAt: now },
    });
    // Disburse: DEBIT the loan account (it goes negative — the amount owed) and
    // CREDIT the customer's checking (the cash they receive). Nets to zero. No
    // funds check on the loan account: a loan is meant to start owed.
    await postTransferPair(tx, {
      fromAccountId: loanAccount.id,
      toAccountId: disbursement.id,
      amountMinor: input.principalMinor,
      fromDescription: `Loan principal (amount financed)`,
      toDescription: `Loan disbursement to ${disbursement.name}`,
      now,
    });
    const created = await tx.lendingProduct.create({
      data: {
        accountId: loanAccount.id,
        kind: 'loan',
        status: 'active',
        principalMinor: input.principalMinor,
        apyBps: input.apyBps,
        termMonths: input.termMonths,
        paymentMinor: input.paymentMinor,
        openedAt: now,
        maturesAt,
        lastAccruedAt: now,
      },
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'lending_open_loan',
      entity: 'lending_product',
      entityId: created.id,
      reason: `Opened a ${formatMinor(input.principalMinor)} loan over ${input.termMonths} months at ${input.apyBps / 100}% APY (simulated)`,
      metadata: { accountId: loanAccount.id, disbursementAccountId: disbursement.id, apyBps: input.apyBps, termMonths: input.termMonths, paymentMinor: input.paymentMinor, actorName: user.displayName },
    });
    return { product: created, account: loanAccount };
  });

  return toLendingProductDTO(prisma, product, account);
}

// ---- Make a loan payment ----------------------------------------------------

/** Load a product the caller can access, or throw a typed not-found/forbidden. */
async function requireOwnedProduct(userId: string, productId: string): Promise<{ product: LendingProduct; account: Account }> {
  const product = await prisma.lendingProduct.findUnique({ where: { id: productId } });
  if (!product) throw new LendingError('not_found', 'That product was not found.');
  const account = await prisma.account.findUniqueOrThrow({ where: { id: product.accountId } });
  const relationship = await getAccountRelationship(prisma, userId, product.accountId);
  if (!relationship || !MOVABLE.has(relationship)) {
    throw new LendingError('forbidden', 'You cannot act on that product.');
  }
  return { product, account };
}

export async function makeLoanPayment(
  user: SessionUser,
  productId: string,
  input: NormalizedLoanPayment,
  now: Date,
): Promise<LendingProductDTO> {
  const { product, account } = await requireOwnedProduct(user.id, productId);
  if (product.kind !== 'loan') throw new LendingError('invalid_state', 'That product is not a loan.');
  if (product.status !== 'active') throw new LendingError('invalid_state', 'That loan is already paid off or closed.');

  const from = await requireMovable(user.id, input.fromAccountId);
  if (from.id === account.id) throw new LendingError('invalid_state', 'Choose an account other than the loan.');

  const owed = -(await currentMinor(prisma, account.id)); // positive while owed
  if (owed <= 0) throw new LendingError('invalid_state', 'This loan has no outstanding balance.');

  // Default to the scheduled payment; never pay more than what is owed.
  const requested = input.amountMinor ?? product.paymentMinor ?? owed;
  const amount = Math.min(requested, owed);
  if (amount <= 0) throw new LendingError('invalid_state', 'Nothing to pay.');

  if ((await availableMinor(prisma, from.id)) < amount) {
    throw new LendingError('insufficient_funds', 'That payment exceeds the available balance.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await postTransferPair(tx, {
      fromAccountId: from.id,
      toAccountId: account.id,
      amountMinor: amount,
      fromDescription: `Loan payment — ${account.name}`,
      toDescription: `Loan payment from ${from.name}`,
      now,
    });

    const remainingOwed = owed - amount;
    const paidOff = remainingOwed <= 0;
    const next = await tx.lendingProduct.update({
      where: { id: product.id },
      data: { status: paidOff ? 'paid_off' : 'active', updatedAt: now },
    });
    if (paidOff) {
      await tx.account.update({ where: { id: account.id }, data: { status: 'closed', updatedAt: now } });
    }
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: paidOff ? 'lending_loan_paid_off' : 'lending_loan_payment',
      entity: 'lending_product',
      entityId: product.id,
      reason: `Paid ${formatMinor(amount)} toward ${account.name}${paidOff ? ' — loan paid off' : ''} (simulated)`,
      metadata: { fromAccountId: from.id, amountMinor: amount, remainingOwed, actorName: user.displayName },
    });
    return next;
  });

  return toLendingProductDTO(prisma, updated, account);
}

// ---- Withdraw a matured CD --------------------------------------------------

export async function withdrawMaturedCd(
  user: SessionUser,
  productId: string,
  toAccountId: string,
  now: Date,
): Promise<LendingProductDTO> {
  const { product, account } = await requireOwnedProduct(user.id, productId);
  if (product.kind !== 'cd') throw new LendingError('invalid_state', 'That product is not a CD.');
  if (product.status === 'closed') throw new LendingError('invalid_state', 'That CD is already closed.');
  // Matured by status, or matured by the simulated clock having passed maturity.
  const matured = product.status === 'matured' || now.getTime() >= product.maturesAt.getTime();
  if (!matured) throw new LendingError('not_matured', 'This CD has not reached maturity yet.');

  const to = await requireMovable(user.id, toAccountId);
  if (to.id === account.id) throw new LendingError('invalid_state', 'Choose an account other than the CD.');

  const balance = await currentMinor(prisma, account.id);
  if (balance <= 0) throw new LendingError('invalid_state', 'This CD has no balance to withdraw.');

  const updated = await prisma.$transaction(async (tx) => {
    await postTransferPair(tx, {
      fromAccountId: account.id,
      toAccountId: to.id,
      amountMinor: balance,
      fromDescription: `CD withdrawal at maturity`,
      toDescription: `Matured CD proceeds from ${account.name}`,
      now,
    });
    const next = await tx.lendingProduct.update({
      where: { id: product.id },
      data: { status: 'closed', updatedAt: now },
    });
    await tx.account.update({ where: { id: account.id }, data: { status: 'closed', updatedAt: now } });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'lending_cd_withdrawn',
      entity: 'lending_product',
      entityId: product.id,
      reason: `Withdrew matured CD proceeds ${formatMinor(balance)} to ${to.name} (simulated)`,
      metadata: { toAccountId: to.id, amountMinor: balance, actorName: user.displayName },
    });
    return next;
  });

  return toLendingProductDTO(prisma, updated, account);
}

// ---- Reads ------------------------------------------------------------------

/** Lending products on accounts the caller can access. */
export async function listLendingForUser(user: SessionUser): Promise<LendingProductDTO[]> {
  const grants = await prisma.accountAccess.findMany({ where: { userId: user.id }, select: { accountId: true } });
  const ownedIds = (await prisma.account.findMany({ where: { userId: user.id }, select: { id: true } })).map((a) => a.id);
  const accountIds = Array.from(new Set([...grants.map((g) => g.accountId), ...ownedIds]));

  const products = await prisma.lendingProduct.findMany({
    where: { accountId: { in: accountIds } },
    include: { account: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return Promise.all(products.map((p) => toLendingProductDTO(prisma, p, p.account)));
}

/** Every lending product (operator/admin view). */
export async function listAllLending(): Promise<LendingProductDTO[]> {
  const products = await prisma.lendingProduct.findMany({
    include: { account: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return Promise.all(products.map((p) => toLendingProductDTO(prisma, p, p.account)));
}

export { LENDING_KIND_LABELS };
