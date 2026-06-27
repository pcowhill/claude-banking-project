import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatMinor, type AccountTransactionsResponse } from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TransactionList } from '../components/TransactionList';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { cn } from '../lib/cn';
import { accountTypeLabel, RELATIONSHIP_META } from '../lib/account-display';
import { fetchAccountTransactions } from '../lib/auth';
import { createInvitation } from '../lib/invitations';

/**
 * One account in detail (v0.4.0, tasks D-05/D-06): the account header with
 * ledger-DERIVED balances, then its transaction history (pending vs posted,
 * with search/filter). Scoped server-side — a 403/404 is shown as a friendly
 * "no access / not found" rather than leaking whether the account exists.
 */

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: AccountTransactionsResponse }
  | { phase: 'forbidden' }
  | { phase: 'notFound' }
  | { phase: 'offline' };

function BackLink() {
  return (
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal-dark hover:underline"
    >
      <span aria-hidden="true">←</span> Back to accounts
    </Link>
  );
}

function AccountHeader({ data }: { data: AccountTransactionsResponse }) {
  const { account } = data;
  const meta = RELATIONSHIP_META[account.relationship];
  const { balances } = account;
  const canMoveMoney = account.status === 'active' && account.relationship !== 'viewer';
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {accountTypeLabel(account.type)}
          </span>
          <CardTitle className="text-xl">{account.name}</CardTitle>
        </div>
        <div className="flex items-center gap-3">
          {canMoveMoney && (
            <Link to="/move-money" state={{ accountId: account.id }}>
              <Button type="button" size="sm" variant="secondary">
                Move money
              </Button>
            </Link>
          )}
          <span
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              meta.className,
            )}
          >
            {meta.label}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:max-w-md">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Available</div>
          <div className="text-3xl font-bold text-brand-navy tabular-nums">
            {formatMinor(balances.availableMinor, account.currency)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Current</div>
          <div className="text-3xl font-semibold text-slate-700 tabular-nums">
            {formatMinor(balances.currentMinor, account.currency)}
          </div>
        </div>
      </div>

      {(balances.pendingDebitMinor > 0 ||
        balances.heldMinor > 0 ||
        balances.pendingCreditMinor > 0) && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
          {balances.pendingDebitMinor > 0 && (
            <span>Pending out: {formatMinor(balances.pendingDebitMinor, account.currency)}</span>
          )}
          {balances.heldMinor > 0 && (
            <span>On hold: {formatMinor(balances.heldMinor, account.currency)}</span>
          )}
          {balances.pendingCreditMinor > 0 && (
            <span>
              Pending in: {formatMinor(balances.pendingCreditMinor, account.currency)} (not yet
              available)
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function StateCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4 border-dashed">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{children}</CardDescription>
    </Card>
  );
}

/**
 * Owner-only "invite a joint owner" form (v0.6.0, task N-10). Posts to
 * `POST /api/accounts/:id/invitations`; on success shows a simulated
 * confirmation, otherwise surfaces the field/server error. Only rendered for an
 * account where the viewer is the owner — the server also enforces this.
 */
function InviteJointOwner({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSentTo(null);
    setSubmitting(true);
    const result = await createInvitation(accountId, email.trim());
    if (result.ok) {
      setSentTo(result.invitation.inviteeEmail);
      setEmail('');
      setSubmitting(false);
      return;
    }
    setError(result.message);
    setSubmitting(false);
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-brand-navy">Invite a joint owner</h2>
      <p className="text-sm text-slate-600">
        Send a simulated invitation for someone to share <strong>{accountName}</strong> as a joint
        owner.
      </p>
      <Card className="mt-3">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700">
              Their email
            </label>
            <input
              id="invite-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
              aria-invalid={!!error}
              aria-describedby={error ? 'invite-error' : undefined}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          {error && (
            <p
              id="invite-error"
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {error}
            </p>
          )}

          {sentTo && (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
            >
              Invitation sent to <span className="font-medium">{sentTo}</span> — simulated. They’ll
              see it in their dashboard inbox.
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </form>
        <p className="mt-4 rounded-lg bg-brand-gold/15 px-3 py-2 text-[11px] text-brand-ink">
          Invitations are simulated — no real email is sent and no real person is contacted.
        </p>
      </Card>
    </section>
  );
}

export function AccountDetail() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ phase: 'loading' });
    void fetchAccountTransactions(id).then((res) => {
      if (!active) return;
      if (res.status === 200 && res.data) setState({ phase: 'ok', data: res.data });
      else if (res.status === 403) setState({ phase: 'forbidden' });
      else if (res.status === 404) setState({ phase: 'notFound' });
      else setState({ phase: 'offline' });
    });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <BackendStatusPill />
      </div>

      {state.phase === 'loading' && (
        <Card className="mt-4 animate-pulse">
          <div className="h-4 w-24 rounded bg-slate-100" />
          <div className="mt-4 h-9 w-40 rounded bg-slate-100" />
        </Card>
      )}

      {state.phase === 'offline' && (
        <StateCard title="Account unavailable">
          We could not load this account. The backend may be offline — start it with{' '}
          <code className="font-mono">npm run dev</code> and refresh.
        </StateCard>
      )}

      {state.phase === 'notFound' && (
        <StateCard title="Account not found">
          We couldn’t find that account. It may have been removed.{' '}
          <Link to="/dashboard" className="font-medium text-brand-teal-dark hover:underline">
            Return to your accounts
          </Link>
          .
        </StateCard>
      )}

      {state.phase === 'forbidden' && (
        <StateCard title="No access to this account">
          You don’t have access to this account. You can only view accounts you own or are an
          authorized user on.
        </StateCard>
      )}

      {state.phase === 'ok' && (
        <>
          <AccountHeader data={state.data} />

          <div className="mt-8 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-brand-navy">Transactions</h2>
            <Link
              to="/statements"
              className="text-sm font-medium text-brand-teal-dark hover:underline"
            >
              Statements &amp; documents
            </Link>
          </div>
          <div className="mt-3">
            <TransactionList
              transactions={state.data.transactions}
              currency={state.data.account.currency}
            />
          </div>

          {state.data.account.relationship === 'owner' && (
            <InviteJointOwner
              accountId={state.data.account.id}
              accountName={state.data.account.name}
            />
          )}

          <p className="mt-6 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
            Balances and the running balance are DERIVED on the server from an append-only ledger —
            never stored. This is a simulation: no real money or accounts.
          </p>
        </>
      )}
    </div>
  );
}
