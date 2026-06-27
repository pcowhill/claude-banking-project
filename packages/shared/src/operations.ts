/**
 * Operations-simulator contracts shared by the backend and the operations
 * console (v0.5.0). The Bank Operations Simulator works a queue of
 * `OperationsRequest` work items; operators approve / reject / hold / request
 * more info, every action is audited, and changes are pushed to connected
 * consoles over Socket.IO. It can also emit clearly-labelled SIMULATED external
 * events (SMS / email / MFA / identity) — never a real provider.
 *
 * This module is pure and dependency-free so the state-machine + display logic
 * is defined ONCE and unit-tested without a database. The request/status TYPES
 * themselves live in `./types` (`OPS_REQUEST_TYPES`, `OPS_REQUEST_STATUSES`) and
 * are imported here; they are exported from the package barrel already, so this
 * module deliberately does not re-export them.
 *
 * MONEY DISCIPLINE: an operator action in v0.5.0 changes a request's WORKFLOW
 * state and writes an audit row — it never posts to the ledger. Money movement
 * (and the ledger effects of an approval) arrive in v0.7.0. Balances stay
 * derived from the append-only ledger.
 */
import { OPS_REQUEST_STATUSES, type OpsRequestStatus, type OpsRequestType } from './types';

// ---- Enums (the v0.5.0 additions) ------------------------------------------

/**
 * The DECISION actions that move a request through its workflow. This drives the
 * console's action bar, so it is deliberately just the four decisions — see
 * {@link OPS_NOTE_ACTION} for the non-decision `note` action, which is NOT part
 * of this set (it must never render as a fifth decision button).
 */
export const OPS_ACTIONS = ['approve', 'reject', 'hold', 'request_info'] as const;
export type OpsDecisionAction = (typeof OPS_ACTIONS)[number];

/**
 * A non-decision action (v0.6.0): record a free-form note in the audit trail
 * WITHOUT changing the request's workflow status. Unlike the decisions, a note
 * is allowed at ANY time — including on an already-resolved (terminal) request —
 * so an operator can annotate a decision after the fact. It posts nothing to the
 * ledger.
 */
export const OPS_NOTE_ACTION = 'note';

/** Any action the action endpoint accepts: a workflow decision or a `note`. */
export type OpsAction = OpsDecisionAction | typeof OPS_NOTE_ACTION;

/** True for the four workflow decisions (i.e. not the `note` action). */
export function isDecisionAction(action: OpsAction): action is OpsDecisionAction {
  return action !== OPS_NOTE_ACTION;
}

/** Triage priority for a queue item. */
export const OPS_REQUEST_PRIORITIES = ['low', 'normal', 'high'] as const;
export type OpsRequestPriority = (typeof OPS_REQUEST_PRIORITIES)[number];

/**
 * Channels for SIMULATED external messaging / verification. These NEVER touch a
 * real SMS, email, MFA, or identity provider — they only record a fake event the
 * operator console can display, exactly as the simulation-safety rules require.
 */
export const SIM_EVENT_CHANNELS = ['sms', 'email', 'mfa', 'identity'] as const;
export type SimEventChannel = (typeof SIM_EVENT_CHANNELS)[number];

/** Direction of a simulated event relative to the bank. */
export const SIM_EVENT_DIRECTIONS = ['outbound', 'inbound'] as const;
export type SimEventDirection = (typeof SIM_EVENT_DIRECTIONS)[number];

/** Lifecycle status of a simulated external event. */
export const SIM_EVENT_STATUSES = [
  'sent',
  'delivered',
  'failed',
  'pending',
  'approved',
  'rejected',
] as const;
export type SimEventStatus = (typeof SIM_EVENT_STATUSES)[number];

// ---- State machine ----------------------------------------------------------

/** The status a request lands in after a given DECISION action. */
export const OPS_ACTION_RESULT: Record<OpsDecisionAction, OpsRequestStatus> = {
  approve: 'approved',
  reject: 'rejected',
  hold: 'on_hold',
  request_info: 'info_requested',
};

/**
 * The resulting status for an action, or `null` when the action does not change
 * status (a {@link OPS_NOTE_ACTION}). Pure — the single transition rule.
 */
export function nextStatusForAction(action: OpsAction): OpsRequestStatus | null {
  return isDecisionAction(action) ? OPS_ACTION_RESULT[action] : null;
}

/**
 * Terminal statuses: a request that has been approved or rejected is resolved
 * and accepts no further operator actions. `pending` / `on_hold` /
 * `info_requested` are all still actionable (e.g. a held item can later be
 * approved, an info-requested item rejected, etc.).
 */
export const TERMINAL_OPS_STATUSES: readonly OpsRequestStatus[] = ['approved', 'rejected'];

/** True if the request is resolved and no further action may be taken. */
export function isTerminalOpsStatus(status: OpsRequestStatus): boolean {
  return TERMINAL_OPS_STATUSES.includes(status);
}

/**
 * Whether an operator action is allowed given the request's current status. A
 * `note` may be added at ANY time (including on a terminal request); the four
 * workflow decisions are blocked once the request is resolved.
 */
export function canApplyAction(status: OpsRequestStatus, action: OpsAction): boolean {
  if (!isDecisionAction(action)) return true; // a note is always allowed
  return !isTerminalOpsStatus(status);
}

// ---- Type guards (handy for server-side request validation) -----------------

export function isOpsAction(value: unknown): value is OpsAction {
  return (
    typeof value === 'string' &&
    (value === OPS_NOTE_ACTION || (OPS_ACTIONS as readonly string[]).includes(value))
  );
}

export function isSimEventChannel(value: unknown): value is SimEventChannel {
  return typeof value === 'string' && (SIM_EVENT_CHANNELS as readonly string[]).includes(value);
}

// ---- Display helpers --------------------------------------------------------

export const OPS_REQUEST_TYPE_LABELS: Record<OpsRequestType, string> = {
  onboarding: 'New account application',
  identity_verification: 'Identity verification',
  mfa: 'MFA challenge',
  deposit: 'Deposit review',
  ach: 'ACH transfer',
  wire: 'Wire transfer',
  bill_pay: 'Bill payment',
  fraud_alert: 'Fraud alert',
  dispute: 'Transaction dispute',
  support_message: 'Support message',
  password_reset: 'Password reset',
  external_account_verification: 'External account verification',
};

export const OPS_REQUEST_STATUS_LABELS: Record<OpsRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  on_hold: 'On hold',
  info_requested: 'Info requested',
};

export const OPS_ACTION_LABELS: Record<OpsAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  hold: 'Hold',
  request_info: 'Request info',
  note: 'Add note',
};

export const OPS_PRIORITY_LABELS: Record<OpsRequestPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

export const SIM_EVENT_CHANNEL_LABELS: Record<SimEventChannel, string> = {
  sms: 'SMS',
  email: 'Email',
  mfa: 'MFA',
  identity: 'Identity',
};

export function opsTypeLabel(type: OpsRequestType): string {
  return OPS_REQUEST_TYPE_LABELS[type] ?? type;
}
export function opsStatusLabel(status: OpsRequestStatus): string {
  return OPS_REQUEST_STATUS_LABELS[status] ?? status;
}
export function opsActionLabel(action: OpsAction): string {
  return OPS_ACTION_LABELS[action] ?? action;
}
export function channelLabel(channel: SimEventChannel): string {
  return SIM_EVENT_CHANNEL_LABELS[channel] ?? channel;
}

// ---- Queues (group request TYPES into the operator's queue buckets) ---------

export interface OpsQueueDef {
  key: string;
  label: string;
  types: OpsRequestType[];
}

/**
 * How request types roll up into the console's queue lanes. Used by the operator
 * UI to bucket the live queue and by the dashboard to label per-lane counts.
 */
export const OPS_QUEUES: readonly OpsQueueDef[] = [
  {
    key: 'identity',
    label: 'Onboarding & identity',
    types: ['onboarding', 'identity_verification', 'mfa', 'password_reset', 'external_account_verification'],
  },
  { key: 'money', label: 'Deposits & transfers', types: ['deposit', 'ach', 'wire', 'bill_pay'] },
  { key: 'risk', label: 'Fraud & disputes', types: ['fraud_alert', 'dispute'] },
  { key: 'support', label: 'Support', types: ['support_message'] },
];

/** The queue lane key a request type belongs to (`'other'` if unmapped). */
export function queueForType(type: OpsRequestType): string {
  return OPS_QUEUES.find((queue) => queue.types.includes(type))?.key ?? 'other';
}

// ---- DTOs (the API + socket payload shapes) ---------------------------------

/** A queue work item as exposed to the operations console. */
export interface OperationsRequestDTO {
  id: string;
  type: OpsRequestType;
  status: OpsRequestStatus;
  priority: OpsRequestPriority;
  summary: string;
  detail: string | null;
  /** The customer/applicant this item concerns (display only; not an FK). */
  subjectName: string | null;
  subjectEmail: string | null;
  /** Parsed JSON simulation context, or null. */
  payload: Record<string, unknown> | null;
  /** The most recent operator action applied, if any. */
  lastAction: OpsAction | null;
  lastActorName: string | null;
  lastActionNote: string | null;
  /** ISO timestamps. `resolvedAt` is set when the item reaches a terminal status. */
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/** One entry in a request's operator-action history (derived from the audit log). */
export interface OperatorActionLogDTO {
  id: string;
  /** `'created'` for the seed/intake row, otherwise an {@link OpsAction}. */
  action: OpsAction | 'created' | string;
  actorName: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
}

/** A SIMULATED external event (SMS/email/MFA/identity). Never a real provider. */
export interface SimulatedEventDTO {
  id: string;
  channel: SimEventChannel;
  direction: SimEventDirection;
  kind: string | null;
  status: SimEventStatus;
  summary: string;
  detail: string | null;
  requestId: string | null;
  createdAt: string;
}

/** Request detail = the item plus its action history and related simulated events. */
export interface OperationsRequestDetailDTO extends OperationsRequestDTO {
  history: OperatorActionLogDTO[];
  events: SimulatedEventDTO[];
}

// ---- API request/response DTOs ----------------------------------------------

/** Counts by status for the queue header / dashboard. */
export type OpsStatusCounts = Record<OpsRequestStatus, number>;

/** GET /api/ops/requests success payload (the live queue + its status counts). */
export interface OperationsQueueResponse {
  requests: OperationsRequestDTO[];
  counts: OpsStatusCounts;
}

/** GET /api/ops/requests/:id success payload. */
export interface OperationsRequestDetailResponse {
  request: OperationsRequestDetailDTO;
}

/** Server/client filter for the queue list. */
export interface OperationsQueueQuery {
  status?: OpsRequestStatus;
  type?: OpsRequestType;
}

/** POST /api/ops/requests/:id/action body. */
export interface OperatorActionRequest {
  action: OpsAction;
  note?: string;
}

/** POST /api/ops/requests/:id/action success payload (the updated item). */
export interface OperatorActionResponse {
  request: OperationsRequestDTO;
}

/** POST /api/ops/simulate/event body — generate a SIMULATED external event. */
export interface SimulateEventRequest {
  channel: SimEventChannel;
  /** A sub-kind label, e.g. `otp`, `notification`, `verification`. */
  kind?: string;
  /** Relate the event to a queue item (optional). */
  requestId?: string;
  /** Desired simulated outcome; defaults per channel when omitted. */
  outcome?: SimEventStatus;
  direction?: SimEventDirection;
  /** Optional override for the event summary line. */
  summary?: string;
}

/** POST /api/ops/simulate/event success payload. */
export interface SimulateEventResponse {
  event: SimulatedEventDTO;
}

/** GET /api/ops/events success payload (recent simulated events, newest-first). */
export interface SimulatedEventsResponse {
  events: SimulatedEventDTO[];
}

// ---- Socket payloads (event NAMES live in constants.ts: SOCKET_EVENTS) ------

export type OpsRequestChange = 'created' | 'updated';

/** Payload for `SOCKET_EVENTS.opsRequestChanged`. */
export interface OpsRequestChangedPayload {
  change: OpsRequestChange;
  request: OperationsRequestDTO;
}

/** Payload for `SOCKET_EVENTS.opsExternalEvent`. */
export interface OpsExternalEventPayload {
  event: SimulatedEventDTO;
}

// ---- Pure aggregation -------------------------------------------------------

/**
 * Count requests by status, always returning a full record (every status key
 * present, zero when absent). Pure — used by the API response and the UI badges.
 */
export function countRequestsByStatus(
  requests: readonly Pick<OperationsRequestDTO, 'status'>[],
): OpsStatusCounts {
  const counts = Object.fromEntries(OPS_REQUEST_STATUSES.map((s) => [s, 0])) as OpsStatusCounts;
  for (const request of requests) {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
  }
  return counts;
}
