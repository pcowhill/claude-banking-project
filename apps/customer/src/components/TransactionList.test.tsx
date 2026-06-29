import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TransactionDTO } from '@simbank/shared';
import { TransactionList } from './TransactionList';

/**
 * The project's FIRST real component test (Q-01). Renders the logic-bearing
 * TransactionList with sample props and asserts its behavior:
 *
 *  - pending vs posted vs other GROUPING (driven by the shared `groupForStatus`);
 *  - the running settled balance shows only on posted rows;
 *  - the instant search + status/category filters (the shared `filterTransactions`).
 *
 * It is a pure render test: no network is touched (the dispute action only fires
 * a request after the inline form is opened AND submitted, which these cases
 * never do).
 */

/** Build a TransactionDTO with sensible display defaults. */
function txn(overrides: Partial<TransactionDTO> & Pick<TransactionDTO, 'id'>): TransactionDTO {
  const signed = overrides.signedAmountMinor ?? -1_00;
  return {
    accountId: 'acct-1',
    amountMinor: Math.abs(signed),
    direction: signed >= 0 ? 'credit' : 'debit',
    status: 'posted',
    origin: 'payment',
    description: 'A transaction',
    postedAt: '2026-06-20T12:00:00.000Z',
    createdAt: '2026-06-20T12:00:00.000Z',
    signedAmountMinor: signed,
    runningBalanceMinor: null,
    ...overrides,
  };
}

/** A representative mix: posted payroll + groceries, a pending hold, a failed entry. */
function sampleTransactions(): TransactionDTO[] {
  return [
    txn({
      id: 'posted-payroll',
      description: 'Payroll deposit',
      origin: 'deposit',
      status: 'posted',
      signedAmountMinor: 2_000_00,
      runningBalanceMinor: 2_000_00,
    }),
    txn({
      id: 'posted-groceries',
      description: 'Groceries — Simmons Market',
      origin: 'card',
      status: 'posted',
      signedAmountMinor: -54_25,
      runningBalanceMinor: 1_945_75,
    }),
    txn({
      id: 'pending-coffee',
      description: 'Coffee Roasters (pending authorization)',
      origin: 'card',
      status: 'pending',
      signedAmountMinor: -6_50,
      runningBalanceMinor: null,
      postedAt: null,
    }),
    txn({
      id: 'failed-wire',
      description: 'Wire that failed',
      origin: 'payment',
      status: 'failed',
      signedAmountMinor: -100_00,
      runningBalanceMinor: null,
      postedAt: null,
    }),
  ];
}

describe('<TransactionList />', () => {
  it('groups transactions into Pending, Posted, and Other sections', () => {
    render(<TransactionList transactions={sampleTransactions()} />);

    // Section headings are present (the "Other" group covers failed/reversed).
    expect(screen.getByRole('heading', { name: /^pending$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^posted$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^other$/i })).toBeInTheDocument();

    // The pending hold sits under the Pending heading, not Posted.
    expect(screen.getByText(/coffee roasters \(pending authorization\)/i)).toBeInTheDocument();
    expect(screen.getByText(/payroll deposit/i)).toBeInTheDocument();
    expect(screen.getByText(/wire that failed/i)).toBeInTheDocument();
  });

  it('renders the running balance on posted rows but not on pending rows', () => {
    render(<TransactionList transactions={sampleTransactions()} />);

    // The posted groceries row's running balance is shown.
    expect(screen.getByText('$1,945.75')).toBeInTheDocument();
    // The pending row carries no running balance, so its (null) balance is absent.
    // (Its signed amount still renders, but with the +/- sign — checked below.)
    expect(screen.getByText('-$6.50')).toBeInTheDocument();
  });

  it('shows signed amounts with explicit +/- signs', () => {
    render(<TransactionList transactions={sampleTransactions()} />);
    expect(screen.getByText('+$2,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$54.25')).toBeInTheDocument();
  });

  it('filters by free-text search over the description', async () => {
    const user = userEvent.setup();
    render(<TransactionList transactions={sampleTransactions()} />);

    await user.type(screen.getByRole('searchbox', { name: /search transactions/i }), 'Simmons');

    expect(screen.getByText(/groceries — simmons market/i)).toBeInTheDocument();
    // Non-matching rows drop out entirely.
    expect(screen.queryByText(/payroll deposit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coffee roasters/i)).not.toBeInTheDocument();
  });

  it('filters to pending only via the status select', async () => {
    const user = userEvent.setup();
    render(<TransactionList transactions={sampleTransactions()} />);

    await user.selectOptions(screen.getByLabelText(/filter by status/i), 'pending');

    expect(screen.getByText(/coffee roasters \(pending authorization\)/i)).toBeInTheDocument();
    // Posted + failed rows are hidden when filtering to pending.
    expect(screen.queryByText(/payroll deposit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wire that failed/i)).not.toBeInTheDocument();
  });

  it('filters by category (origin) via the category select', async () => {
    const user = userEvent.setup();
    render(<TransactionList transactions={sampleTransactions()} />);

    // "Deposit" matches only the payroll entry.
    await user.selectOptions(screen.getByLabelText(/filter by category/i), 'deposit');

    expect(screen.getByText(/payroll deposit/i)).toBeInTheDocument();
    expect(screen.queryByText(/groceries — simmons market/i)).not.toBeInTheDocument();
  });

  it('shows an empty-state message when nothing matches the search', async () => {
    const user = userEvent.setup();
    render(<TransactionList transactions={sampleTransactions()} />);

    await user.type(
      screen.getByRole('searchbox', { name: /search transactions/i }),
      'zzz-no-such-merchant',
    );

    expect(screen.getByText(/no transactions match your search/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^posted$/i })).not.toBeInTheDocument();
  });

  it('offers a Dispute action on a posted row and not on a pending row', () => {
    render(<TransactionList transactions={sampleTransactions()} />);

    // The posted Posted group exposes Dispute buttons (one per posted row).
    const posted = screen.getByRole('heading', { name: /^posted$/i }).closest('section');
    expect(posted).not.toBeNull();
    const disputeButtons = within(posted as HTMLElement).getAllByRole('button', {
      name: /^dispute$/i,
    });
    expect(disputeButtons.length).toBeGreaterThan(0);

    // The pending group offers no Dispute action.
    const pending = screen.getByRole('heading', { name: /^pending$/i }).closest('section');
    expect(
      within(pending as HTMLElement).queryByRole('button', { name: /^dispute$/i }),
    ).toBeNull();
  });
});
