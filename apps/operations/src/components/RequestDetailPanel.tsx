import { useCallback, useEffect, useState } from 'react';
import {
  asDisputePayload,
  asFraudPayload,
  asMovementPayload,
  DISPUTE_REASON_LABELS,
  formatMinor,
  FRAUD_RESPONSE_LABELS,
  isOnboardingProduct,
  isRequestReversed,
  isTerminalOpsStatus,
  MOVEMENT_DIRECTION_LABELS,
  MOVEMENT_TEXT,
  movementKindLabel,
  ONBOARDING_PRODUCT_LABELS,
  opsActionLabel,
  opsTypeLabel,
  type DisputePayload,
  type FraudPayload,
  type MovementPayload,
  type OperationsRequestDetailDTO,
  type OpsAction,
  type OpsRequestStatus,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { fetchOpsRequestDetail } from '../lib/opsApi';
import { useOpsData } from '../lib/ops-data-context';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { StatusBadge, PriorityBadge, ReversedBadge } from './badges';
import { ActionBar } from './ActionBar';
import { OpsActivityFeed } from './OpsActivityFeed';
import { relativeTime } from '../lib/format';

/** Render one audit/history entry's action verb. */
function historyVerb(action: string): string {
  if (action === 'created') return 'Created';
  // action is an OpsAction string for operator actions; fall back to raw.
  return opsActionLabel(action as OpsAction);
}

/** Onboarding application context lifted defensively from an opaque payload. */
interface OnboardingContext {
  productLabel: string | null;
  openingDeposit: string | null;
  jointInviteEmail: string | null;
}

/** Read the (untyped) onboarding payload into display strings, tolerating gaps. */
function readOnboardingContext(payload: Record<string, unknown> | null): OnboardingContext | null {
  if (!payload) return null;

  const rawProduct = payload.product;
  const productLabel =
    typeof rawProduct === 'string'
      ? isOnboardingProduct(rawProduct)
        ? ONBOARDING_PRODUCT_LABELS[rawProduct]
        : rawProduct
      : null;

  const rawFunding = payload.initialFundingMinor;
  const openingDeposit =
    typeof rawFunding === 'number' && Number.isInteger(rawFunding) ? formatMinor(rawFunding) : null;

  const rawJoint = payload.jointInviteEmail;
  const jointInviteEmail = typeof rawJoint === 'string' && rawJoint.trim() !== '' ? rawJoint : null;

  // Nothing useful to show → render nothing rather than an empty section.
  if (productLabel === null && openingDeposit === null && jointInviteEmail === null) return null;
  return { productLabel, openingDeposit, jointInviteEmail };
}

/**
 * Detail view for the selected queue item: its full context, the operator-action
 * history (from the audit trail), any linked SIMULATED events, and an action bar
 * with an optional note. Actions go through the live data context so the queue
 * and this panel update together.
 *
 * The status badge + decision ActionBar are driven by the LIVE queue copy (from
 * `useOpsData`), so they reflect resolutions that happen ANYWHERE — the left
 * queue card, another operator, or a socket echo — not just actions taken here.
 * A non-decision "Add note" stays available even after a terminal decision.
 */
export function RequestDetailPanel({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const { act, reverse, requests } = useOpsData();
  const [detail, setDetail] = useState<OperationsRequestDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reverseReason, setReverseReason] = useState('');

  // The live copy from the shared queue, if present. Drives status-dependent UI.
  const live = requests.find((r) => r.id === requestId);
  const liveStatus: OpsRequestStatus = live?.status ?? detail?.status ?? 'pending';

  // The money-movement context, read from the LIVE payload (falling back to the
  // loaded detail) so the amount, the "Reversed" indicator, and the reverse
  // affordance all reflect socket echoes (e.g. another operator's reversal).
  const livePayload = live?.payload ?? detail?.payload ?? null;
  const movement: MovementPayload | null = asMovementPayload(livePayload);

  // Fraud + dispute context, read from the LIVE payload (falling back to the
  // loaded detail) so the customer's response, the resolution, and the "Reversed"
  // indicator all reflect socket echoes (e.g. another operator's decision).
  const fraud: FraudPayload | null = detail?.type === 'fraud_alert' ? asFraudPayload(livePayload) : null;
  const dispute: DisputePayload | null = detail?.type === 'dispute' ? asDisputePayload(livePayload) : null;

  // Whether this request's money movement was reversed (operator reversal,
  // dispute upheld, or confirmed fraud). Shown ALONGSIDE the terminal status.
  const reversed = isRequestReversed(livePayload);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchOpsRequestDetail(requestId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load request detail.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  // When the live copy advances past the loaded detail (e.g. resolved elsewhere,
  // or another operator's action arrived over the socket), refresh history +
  // linked events. Guard against loops: only reload when the timestamps differ
  // and we are not already loading/acting.
  useEffect(() => {
    if (!live || !detail) return;
    if (loading || busy) return;
    if (live.updatedAt !== detail.updatedAt) {
      void load();
    }
  }, [live, detail, loading, busy, load]);

  const handleAction = useCallback(
    async (action: OpsAction) => {
      setBusy(true);
      setError(null);
      try {
        await act(requestId, action, note.trim() || undefined);
        setNote('');
        await load(); // refresh history + status
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'That action could not be completed.');
      } finally {
        setBusy(false);
      }
    },
    [act, requestId, note, load],
  );

  // Record an audit note WITHOUT changing status. Allowed at any time, including
  // after a terminal decision — this is "leave a note even after I've decided".
  const handleAddNote = useCallback(async () => {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await act(requestId, 'note', text);
      setNote('');
      await load(); // the new note appears in History
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That note could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [act, requestId, note, load]);

  // Reverse an already-posted movement (pending → posted → reversed). This is a
  // separate, post-decision capability (like "Add note"), NOT a fifth decision —
  // it only appears once the movement has been APPROVED and is not yet reversed.
  const handleReverse = useCallback(async () => {
    const reason = reverseReason.trim();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await reverse(requestId, reason);
      setReverseReason('');
      await load(); // the reversal appears in History; payload flips to reversed
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That movement could not be reversed.');
    } finally {
      setBusy(false);
    }
  }, [reverse, requestId, reverseReason, load]);

  const onboarding = detail?.type === 'onboarding' ? readOnboardingContext(detail.payload) : null;
  const resolved = isTerminalOpsStatus(liveStatus);
  const canAddNote = note.trim().length > 0 && !busy;

  // Reverse affordance: only a posted (approved) movement that is not yet reversed.
  const canShowReverse = movement !== null && liveStatus === 'approved' && movement.reversed !== true;
  const canReverse = reverseReason.trim().length > 0 && !busy;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {detail ? opsTypeLabel(detail.type) : 'Request'}
          </div>
          <h3 className="text-sm font-semibold text-white">{detail?.summary ?? 'Loading…'}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
        >
          Close
        </button>
      </div>

      {loading && !detail && <p className="text-xs text-slate-500">Loading request…</p>}

      {detail && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={liveStatus} />
            {reversed && <ReversedBadge />}
            <PriorityBadge priority={detail.priority} />
          </div>

          {detail.detail && <p className="text-sm text-slate-300">{detail.detail}</p>}

          <dl className="grid grid-cols-1 gap-1 text-xs text-slate-400 sm:grid-cols-2">
            {detail.subjectName && (
              <div>
                <dt className="inline text-slate-500">Subject: </dt>
                <dd className="inline text-slate-200">{detail.subjectName}</dd>
              </div>
            )}
            {detail.subjectEmail && (
              <div>
                <dt className="inline text-slate-500">Email: </dt>
                <dd className="inline text-slate-200">{detail.subjectEmail}</dd>
              </div>
            )}
          </dl>

          {/* Onboarding application context (N-11a) */}
          {onboarding && (
            <section className="rounded-md border border-white/10 bg-brand-navy-deep/40 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Application
              </h4>
              <dl className="mt-2 space-y-1 text-xs text-slate-400">
                {onboarding.productLabel && (
                  <div>
                    <dt className="inline text-slate-500">Product: </dt>
                    <dd className="inline text-slate-200">{onboarding.productLabel}</dd>
                  </div>
                )}
                {onboarding.openingDeposit && (
                  <div>
                    <dt className="inline text-slate-500">Opening deposit: </dt>
                    <dd className="inline text-slate-200">{onboarding.openingDeposit}</dd>
                  </div>
                )}
                {onboarding.jointInviteEmail && (
                  <div>
                    <dt className="inline text-slate-500">Joint invite: </dt>
                    <dd className="inline text-slate-200">{onboarding.jointInviteEmail}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">
                Approving provisions the account and posts any opening deposit (simulated).
              </p>
            </section>
          )}

          {/* Money-movement context (v0.7.0) — only for linked money movements */}
          {movement && (
            <section className="rounded-md border border-white/10 bg-brand-navy-deep/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Money movement
                </h4>
                {movement.reversed && (
                  <span className="inline-flex items-center rounded-full bg-rose-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                    Reversed
                  </span>
                )}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-slate-400">
                <div>
                  <dt className="inline text-slate-500">Type: </dt>
                  <dd className="inline text-slate-200">{movementKindLabel(movement.kind)}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">Amount: </dt>
                  <dd className="inline text-slate-200">{formatMinor(movement.amountMinor)}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">Direction: </dt>
                  <dd className="inline text-slate-200">
                    {MOVEMENT_DIRECTION_LABELS[movement.direction]}
                  </dd>
                </div>
                {movement.counterparty && (
                  <div>
                    <dt className="inline text-slate-500">Counterparty: </dt>
                    <dd className="inline text-slate-200">{movement.counterparty}</dd>
                  </div>
                )}
                {movement.memo && (
                  <div>
                    <dt className="inline text-slate-500">Memo: </dt>
                    <dd className="inline text-slate-200">{movement.memo}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Fraud-alert context (v0.8.0) */}
          {fraud && (
            <section className="rounded-md border border-white/10 bg-brand-navy-deep/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Fraud alert
                </h4>
                {reversed && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                    Reversed
                  </span>
                )}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-slate-400">
                {fraud.merchant && (
                  <div>
                    <dt className="inline text-slate-500">Merchant: </dt>
                    <dd className="inline text-slate-200">{fraud.merchant}</dd>
                  </div>
                )}
                {typeof fraud.amountMinor === 'number' && (
                  <div>
                    <dt className="inline text-slate-500">Amount: </dt>
                    <dd className="inline text-slate-200">{formatMinor(fraud.amountMinor)}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline text-slate-500">Customer response: </dt>
                  <dd className="inline text-slate-200">
                    {fraud.customerResponse
                      ? FRAUD_RESPONSE_LABELS[fraud.customerResponse]
                      : 'No response yet'}
                  </dd>
                </div>
                {fraud.resolution && (
                  <div>
                    <dt className="inline text-slate-500">Resolution: </dt>
                    <dd className="inline text-slate-200">
                      {fraud.resolution === 'confirmed_fraud' ? 'Confirmed fraud' : 'Dismissed'}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">
                Approve = confirm fraud (reverses the charge + freezes the card); Reject = dismiss as
                legitimate. Simulated — no real fraud network is contacted.
              </p>
            </section>
          )}

          {/* Dispute context (v0.8.0) */}
          {dispute && (
            <section className="rounded-md border border-white/10 bg-brand-navy-deep/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Disputed transaction
                </h4>
                {reversed && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                    Reversed
                  </span>
                )}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-slate-400">
                {dispute.description && (
                  <div>
                    <dt className="inline text-slate-500">Transaction: </dt>
                    <dd className="inline text-slate-200">{dispute.description}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline text-slate-500">Amount: </dt>
                  <dd className="inline text-slate-200">{formatMinor(dispute.amountMinor)}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">Reason: </dt>
                  <dd className="inline text-slate-200">{DISPUTE_REASON_LABELS[dispute.reason]}</dd>
                </div>
                {dispute.details && (
                  <div>
                    <dt className="inline text-slate-500">Details: </dt>
                    <dd className="inline text-slate-200">{dispute.details}</dd>
                  </div>
                )}
                {dispute.resolution && (
                  <div>
                    <dt className="inline text-slate-500">Resolution: </dt>
                    <dd className="inline text-slate-200">
                      {dispute.resolution === 'upheld' ? 'Upheld' : 'Denied'}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">
                Approve = uphold (reverses the charge); Reject = deny (the charge stands). Simulated —
                balances stay derived from the ledger.
              </p>
            </section>
          )}

          {/* Optional note + actions */}
          <div className="space-y-2">
            <label htmlFor="ops-note" className="block text-xs font-medium text-slate-400">
              Note (optional) — recorded in the audit log
            </label>
            <textarea
              id="ops-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Add context for this decision…"
              className="w-full rounded-md border border-white/10 bg-brand-navy-deep/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            />
            {movement && !resolved && (
              <p className="text-[11px] text-slate-500">
                Approving posts this movement to the ledger (simulated); rejecting marks it failed.
              </p>
            )}
            <ActionBar status={liveStatus} busy={busy} size="md" onAction={handleAction} />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={!canAddNote}
                onClick={() => void handleAddNote()}
              >
                Add note
              </Button>
              {resolved && (
                <span className="text-[11px] text-slate-500">
                  Resolved — you can still add an audit note.
                </span>
              )}
            </div>
          </div>

          {/* Reverse movement — a post-decision capability, distinct from the
              four-decision ActionBar. Only for a posted (approved) movement that
              has not already been reversed. */}
          {canShowReverse && (
            <section className="space-y-2 rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-200/90">
                Reverse movement
              </h4>
              <p className="text-[11px] text-slate-400">
                Flips the posted ledger entry to reversed (simulated) — balances stay derived,
                nothing is edited. The reason is recorded in the audit log.
              </p>
              <label htmlFor="ops-reverse-reason" className="sr-only">
                Reason for reversal
              </label>
              <textarea
                id="ops-reverse-reason"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                rows={2}
                maxLength={MOVEMENT_TEXT.reasonMaxLength}
                placeholder="Reason for reversal (required)…"
                className="w-full rounded-md border border-white/10 bg-brand-navy-deep/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              />
              <Button
                type="button"
                variant="reject"
                size="md"
                disabled={!canReverse}
                onClick={() => void handleReverse()}
              >
                Reverse movement
              </Button>
            </section>
          )}

          {error && <p className="text-xs text-rose-300/90">{error}</p>}

          {/* Operator-action history (audit trail) */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              History
            </h4>
            <ul className="mt-2 space-y-1.5">
              {detail.history.map((entry) => (
                <li key={entry.id} className="text-xs text-slate-300">
                  <span className="font-semibold text-white">{historyVerb(entry.action)}</span>
                  {entry.actorName ? ` by ${entry.actorName}` : ''}
                  <span className="text-slate-500"> · {relativeTime(entry.createdAt)}</span>
                  {entry.note && <div className="text-slate-400">“{entry.note}”</div>}
                </li>
              ))}
            </ul>
          </section>

          {/* Linked simulated events */}
          {detail.events.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Linked simulated events
              </h4>
              <div className="mt-1">
                <OpsActivityFeed events={detail.events} />
              </div>
            </section>
          )}
        </>
      )}
    </Card>
  );
}
