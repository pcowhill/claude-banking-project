import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  canAddTravelNotice,
  canFreezeCard,
  canReportCard,
  canUnfreezeCard,
  cardNetworkLabel,
  cardStatusLabel,
  cardTypeLabel,
  formatCardExpiry,
  isTerminalCardStatus,
  maskedCardNumber,
  validateIssueCard,
  validateReportCard,
  validateTravelNotice,
  CARD_NETWORKS,
  CARD_REPORT_REASONS,
  CARD_REPORT_REASON_LABELS,
  CARD_TYPES,
  type CardDTO,
  type CardNetwork,
  type CardReportReason,
  type CardStatus,
  type CardType,
  type TravelNoticeDTO,
} from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { cn } from '../lib/cn';
import { accountTypeLabel } from '../lib/account-display';
import { fetchAccounts } from '../lib/auth';
import {
  addTravelNotice,
  cancelTravelNotice,
  freezeCard,
  issueCard,
  listCards,
  reportCard,
  unfreezeCard,
} from '../lib/cards';

/**
 * Cards manager — the authenticated wallet (v0.8.0). Lists the customer's
 * simulated cards (masked number, brand/type, expiry, status) and offers the
 * card LIFECYCLE: freeze/unfreeze, report lost/stolen (which returns a
 * replacement), travel notices (add/cancel), and issuing a new card. Every
 * action is gated by the shared `can*` helpers so the UI and server agree on
 * what is allowed; the lifecycle moves NO money.
 *
 * Lives at /wallet (the public marketing /cards page is unrelated). Loading /
 * empty / offline states keep the page honest when the backend is down.
 *
 * SIMULATION: these are clearly fake cards — a masked last-four, a simulated
 * network and expiry. No real card network, PAN, or issuer is ever involved.
 */

// ---- Shared async state -----------------------------------------------------

interface AsyncData<T> {
  loading: boolean;
  /** null = request failed (offline / unauthorized). */
  data: T | null;
}

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

const inputClasses =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:cursor-not-allowed disabled:bg-slate-50';

// ---- Small primitives -------------------------------------------------------

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

function FormErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}

/** Status badge colours mirroring the operator/account conventions. */
const CARD_STATUS_CLASS: Record<CardStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  frozen: 'bg-sky-50 text-sky-700',
  lost: 'bg-rose-50 text-rose-700',
  stolen: 'bg-rose-50 text-rose-700',
  replaced: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
};

function CardStatusBadge({ status }: { status: CardStatus }) {
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        CARD_STATUS_CLASS[status],
      )}
    >
      {cardStatusLabel(status)}
    </span>
  );
}

// ---- Travel notices ---------------------------------------------------------

function formatNoticeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TravelNoticeForm({
  cardId,
  busy,
  onAdded,
  onError,
}: {
  cardId: string;
  busy: boolean;
  onAdded: (card: CardDTO) => void;
  onError: (message: string) => void;
}) {
  const [destination, setDestination] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || busy) return;
    const check = validateTravelNotice({ destination, startsOn, endsOn, note });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await addTravelNotice(cardId, check.value);
    setSubmitting(false);
    if (!result.ok) {
      setErrors(result.fields ?? {});
      onError(result.message);
      return;
    }
    setDestination('');
    setStartsOn('');
    setEndsOn('');
    setNote('');
    onAdded(result.data.card);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3" noValidate>
      <Field id={`${cardId}-dest`} label="Destination" error={errors.destination}>
        <input
          id={`${cardId}-dest`}
          type="text"
          value={destination}
          maxLength={80}
          disabled={submitting}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Lisbon, Portugal"
          className={inputClasses}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${cardId}-start`} label="Starts" error={errors.startsOn}>
          <input
            id={`${cardId}-start`}
            type="date"
            value={startsOn}
            disabled={submitting}
            onChange={(e) => setStartsOn(e.target.value)}
            className={inputClasses}
          />
        </Field>
        <Field id={`${cardId}-end`} label="Ends" error={errors.endsOn}>
          <input
            id={`${cardId}-end`}
            type="date"
            value={endsOn}
            disabled={submitting}
            onChange={(e) => setEndsOn(e.target.value)}
            className={inputClasses}
          />
        </Field>
      </div>
      <Field id={`${cardId}-note`} label="Note (optional)" error={errors.note}>
        <input
          id={`${cardId}-note`}
          type="text"
          value={note}
          maxLength={200}
          disabled={submitting}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Family holiday"
          className={inputClasses}
        />
      </Field>
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add travel notice'}
      </Button>
    </form>
  );
}

function TravelNoticeList({
  cardId,
  notices,
  onCancelled,
  onError,
}: {
  cardId: string;
  notices: TravelNoticeDTO[];
  onCancelled: (card: CardDTO) => void;
  onError: (message: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const active = notices.filter((n) => n.status === 'active');
  if (active.length === 0) return null;

  async function cancel(noticeId: string) {
    if (pendingId) return;
    setPendingId(noticeId);
    const result = await cancelTravelNotice(cardId, noticeId);
    setPendingId(null);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onCancelled(result.data.card);
  }

  return (
    <ul className="mt-3 space-y-2">
      {active.map((notice) => (
        <li
          key={notice.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <div>
            <span className="font-medium text-slate-700">{notice.destination}</span>
            <span className="ml-2 text-xs text-slate-500">
              {formatNoticeDate(notice.startsOn)} – {formatNoticeDate(notice.endsOn)}
            </span>
            {notice.note && <p className="text-xs text-slate-400">{notice.note}</p>}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pendingId === notice.id}
            onClick={() => void cancel(notice.id)}
          >
            {pendingId === notice.id ? 'Cancelling…' : 'Cancel'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---- Report lost/stolen form -----------------------------------------------

function ReportCardForm({
  cardId,
  onReported,
  onCancel,
  onError,
}: {
  cardId: string;
  onReported: (replacement: CardDTO, replaced: CardDTO) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState<CardReportReason | ''>('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const check = validateReportCard({ reason });
    if (!check.ok || !check.value) {
      setError(check.errors.reason);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const result = await reportCard(cardId, check.value);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.fields?.reason);
      onError(result.message);
      return;
    }
    onReported(result.data.card, result.data.replaced);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3" noValidate>
      <Field id={`${cardId}-reason`} label="What happened to this card?" error={error}>
        <select
          id={`${cardId}-reason`}
          value={reason}
          disabled={submitting}
          onChange={(e) => setReason(e.target.value as CardReportReason | '')}
          className={inputClasses}
        >
          <option value="">Choose a reason</option>
          {CARD_REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {CARD_REPORT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-slate-500">
        Reporting this card terminates it and issues a replacement. (Simulated — no real card.)
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={submitting}>
          {submitting ? 'Reporting…' : 'Report & replace'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---- One card ---------------------------------------------------------------

type Panel = 'none' | 'travel' | 'report';

function CardItem({
  card,
  onUpdated,
  onReplaced,
}: {
  card: CardDTO;
  onUpdated: (card: CardDTO) => void;
  onReplaced: (replacement: CardDTO, replaced: CardDTO) => void;
}) {
  const [panel, setPanel] = useState<Panel>('none');
  const [busy, setBusy] = useState<null | 'freeze' | 'unfreeze'>(null);
  const [error, setError] = useState<string | null>(null);
  const terminal = isTerminalCardStatus(card.status);

  async function toggleFreeze(action: 'freeze' | 'unfreeze') {
    if (busy) return;
    setError(null);
    setBusy(action);
    const result = action === 'freeze' ? await freezeCard(card.id) : await unfreezeCard(card.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUpdated(result.data.card);
  }

  return (
    <li>
      <Card className={cn(terminal && 'opacity-75')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{cardNetworkLabel(card.network)}</CardTitle>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {cardTypeLabel(card.cardType)}
              </span>
            </div>
            <p className="mt-1 font-mono text-sm tracking-wider text-slate-600">
              {maskedCardNumber(card.last4)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {card.cardholderName} · Exp {formatCardExpiry(card.expMonth, card.expYear)} ·{' '}
              {card.accountName}
            </p>
          </div>
          <CardStatusBadge status={card.status} />
        </div>

        {card.replacesCardId && (
          <p className="mt-2 text-xs text-brand-teal-dark">Replacement card.</p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        {!terminal && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canFreezeCard(card.status) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!!busy}
                onClick={() => void toggleFreeze('freeze')}
              >
                {busy === 'freeze' ? 'Freezing…' : 'Freeze'}
              </Button>
            )}
            {canUnfreezeCard(card.status) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!!busy}
                onClick={() => void toggleFreeze('unfreeze')}
              >
                {busy === 'unfreeze' ? 'Unfreezing…' : 'Unfreeze'}
              </Button>
            )}
            {canAddTravelNotice(card.status) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPanel((p) => (p === 'travel' ? 'none' : 'travel'))}
              >
                {panel === 'travel' ? 'Close travel notice' : 'Add travel notice'}
              </Button>
            )}
            {canReportCard(card.status) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPanel((p) => (p === 'report' ? 'none' : 'report'))}
              >
                {panel === 'report' ? 'Cancel report' : 'Report lost / stolen'}
              </Button>
            )}
          </div>
        )}

        {panel === 'travel' && (
          <TravelNoticeForm
            cardId={card.id}
            busy={!!busy}
            onAdded={(updated) => {
              setPanel('none');
              onUpdated(updated);
            }}
            onError={setError}
          />
        )}

        {panel === 'report' && (
          <ReportCardForm
            cardId={card.id}
            onReported={(replacement, replaced) => {
              setPanel('none');
              onReplaced(replacement, replaced);
            }}
            onCancel={() => setPanel('none')}
            onError={setError}
          />
        )}

        <TravelNoticeList
          cardId={card.id}
          notices={card.travelNotices}
          onCancelled={onUpdated}
          onError={setError}
        />
      </Card>
    </li>
  );
}

// ---- Issue a card -----------------------------------------------------------

function IssueCardForm({
  accounts,
  onIssued,
}: {
  accounts: AccountOption[];
  onIssued: (card: CardDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [cardType, setCardType] = useState<CardType | ''>('');
  const [network, setNetwork] = useState<CardNetwork>('visa');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setAccountId('');
    setCardType('');
    setNetwork('visa');
    setErrors({});
    setBanner(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);
    const nextErrors: Partial<Record<string, string>> = {};
    if (!accountId) nextErrors.accountId = 'Choose an account for this card.';
    const check = validateIssueCard({ cardType, network });
    Object.assign(nextErrors, check.errors);
    if (Object.keys(nextErrors).length > 0 || !check.ok || !check.value) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await issueCard(accountId, check.value);
    setSubmitting(false);
    if (!result.ok) {
      setErrors(result.fields ?? {});
      setBanner(result.message);
      return;
    }
    reset();
    setOpen(false);
    onIssued(result.data.card);
  }

  if (!open) {
    return (
      <div className="mt-6">
        <Button type="button" onClick={() => setOpen(true)} disabled={accounts.length === 0}>
          Issue a card
        </Button>
        {accounts.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            You need an active account before you can issue a card.
          </p>
        )}
      </div>
    );
  }

  return (
    <Card className="mt-6">
      <CardTitle>Issue a new card</CardTitle>
      <CardDescription>Add a simulated debit or credit card to one of your accounts.</CardDescription>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}
        <Field id="issue-account" label="Account" error={errors.accountId}>
          <select
            id="issue-account"
            value={accountId}
            disabled={submitting}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputClasses}
          >
            <option value="">Choose an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.type}
              </option>
            ))}
          </select>
        </Field>
        <Field id="issue-type" label="Card type" error={errors.cardType}>
          <select
            id="issue-type"
            value={cardType}
            disabled={submitting}
            onChange={(e) => setCardType(e.target.value as CardType | '')}
            className={inputClasses}
          >
            <option value="">Choose a type</option>
            {CARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {cardTypeLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="issue-network" label="Network" error={errors.network}>
          <select
            id="issue-network"
            value={network}
            disabled={submitting}
            onChange={(e) => setNetwork(e.target.value as CardNetwork)}
            className={inputClasses}
          >
            {CARD_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {cardNetworkLabel(n)}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Issuing…' : 'Issue card'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Page -------------------------------------------------------------------

export function Wallet() {
  const [cards, setCards] = useState<AsyncData<CardDTO[]>>({ loading: true, data: null });
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  useEffect(() => {
    let active = true;
    void listCards().then((result) => {
      if (!active) return;
      setCards({ loading: false, data: result.ok ? result.data.cards : null });
    });
    void fetchAccounts().then((data) => {
      if (!active || !data) return;
      setAccounts(
        data
          .filter((a) => a.status === 'active' && a.relationship !== 'viewer')
          .map((a) => ({ id: a.id, name: a.name, type: accountTypeLabel(a.type) })),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  /** Replace a single card in the list (by id) after a lifecycle action. */
  function upsertCard(updated: CardDTO) {
    setCards((s) => ({
      loading: false,
      data: (s.data ?? []).map((c) => (c.id === updated.id ? updated : c)),
    }));
  }

  /** Prepend a newly-issued card to the list. */
  function prependCard(card: CardDTO) {
    setCards((s) => ({ loading: false, data: [card, ...(s.data ?? [])] }));
  }

  /** After report: mark the old card terminal and prepend the replacement. */
  function applyReplacement(replacement: CardDTO, replaced: CardDTO) {
    setCards((s) => {
      const others = (s.data ?? []).map((c) => (c.id === replaced.id ? replaced : c));
      return { loading: false, data: [replacement, ...others] };
    });
  }

  const sortedCards = useMemo(() => {
    if (!cards.data) return null;
    // In-service cards first, terminal ones after.
    return [...cards.data].sort((a, b) => {
      const at = isTerminalCardStatus(a.status) ? 1 : 0;
      const bt = isTerminalCardStatus(b.status) ? 1 : 0;
      return at - bt;
    });
  }, [cards.data]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal-dark hover:underline"
          >
            <span aria-hidden="true">←</span> Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-brand-navy">Your cards</h1>
          <p className="text-sm text-slate-600">
            Freeze, replace, and manage travel notices for your simulated cards.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        <strong>SIMULATION</strong> — these are fake cards (a masked last-four, a simulated network
        and expiry). No real card network, PAN, or issuer is involved. Card actions move no money.
      </div>

      {cards.loading ? (
        <Card className="mt-6 animate-pulse" aria-busy="true">
          <div className="h-4 w-32 rounded bg-slate-100" />
          <div className="mt-4 h-6 w-56 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-40 rounded bg-slate-100" />
        </Card>
      ) : sortedCards === null ? (
        <Card className="mt-6 border-rose-200 bg-rose-50">
          <CardTitle className="text-rose-700">Cards unavailable</CardTitle>
          <CardDescription className="text-rose-600">
            We could not load your cards. The backend may be offline — start it with{' '}
            <code className="font-mono">npm run dev</code> and refresh.
          </CardDescription>
        </Card>
      ) : sortedCards.length === 0 ? (
        <Card className="mt-6 border-dashed">
          <CardTitle>No cards yet</CardTitle>
          <CardDescription>
            You don’t have any simulated cards yet. Issue one below to get started.
          </CardDescription>
        </Card>
      ) : (
        <ul className="mt-6 space-y-4">
          {sortedCards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onUpdated={upsertCard}
              onReplaced={applyReplacement}
            />
          ))}
        </ul>
      )}

      <IssueCardForm accounts={accounts} onIssued={prependCard} />
    </div>
  );
}
