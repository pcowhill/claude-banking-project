import { useCallback, useEffect, useState } from 'react';
import {
  formatMinor,
  isOnboardingProduct,
  isTerminalOpsStatus,
  ONBOARDING_PRODUCT_LABELS,
  opsActionLabel,
  opsTypeLabel,
  type OperationsRequestDetailDTO,
  type OpsAction,
  type OpsRequestStatus,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { fetchOpsRequestDetail } from '../lib/opsApi';
import { useOpsData } from '../lib/ops-data-context';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { StatusBadge, PriorityBadge } from './badges';
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
  const { act, requests } = useOpsData();
  const [detail, setDetail] = useState<OperationsRequestDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // The live copy from the shared queue, if present. Drives status-dependent UI.
  const live = requests.find((r) => r.id === requestId);
  const liveStatus: OpsRequestStatus = live?.status ?? detail?.status ?? 'pending';

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

  const onboarding = detail?.type === 'onboarding' ? readOnboardingContext(detail.payload) : null;
  const resolved = isTerminalOpsStatus(liveStatus);
  const canAddNote = note.trim().length > 0 && !busy;

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
