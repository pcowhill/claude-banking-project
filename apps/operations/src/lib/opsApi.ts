import type {
  AdvanceClockRequest,
  AdvanceClockResponse,
  ClockResponse,
  OperationsQueueResponse,
  OperationsRequestDetailDTO,
  OperationsRequestDetailResponse,
  OperationsQueueQuery,
  OperatorActionRequest,
  OperatorActionResponse,
  OperationsRequestDTO,
  ReverseMovementRequest,
  ScheduleDTO,
  SimulateEventRequest,
  SimulateEventResponse,
  SimulatedEventDTO,
  SimulatedEventsResponse,
} from '@simbank/shared';
import { apiRequest } from './api';

/**
 * Typed client for the v0.5.0 operations endpoints. Every call carries the
 * operator session cookie (via `apiRequest`) and throws `ApiError` on failure so
 * the console can show a specific message. These operate on the SIMULATED queue
 * only — no real money, no real providers.
 */

function queryString(query: OperationsQueueQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** GET /api/ops/requests — the live queue + status counts. */
export function fetchOpsRequests(query: OperationsQueueQuery = {}): Promise<OperationsQueueResponse> {
  return apiRequest<OperationsQueueResponse>(`/api/ops/requests${queryString(query)}`);
}

/** GET /api/ops/requests/:id — one request with history + linked events. */
export async function fetchOpsRequestDetail(id: string): Promise<OperationsRequestDetailDTO> {
  const res = await apiRequest<OperationsRequestDetailResponse>(
    `/api/ops/requests/${encodeURIComponent(id)}`,
  );
  return res.request;
}

/** POST /api/ops/requests/:id/action — approve / reject / hold / request_info. */
export async function applyOpsAction(
  id: string,
  action: OperatorActionRequest['action'],
  note?: string,
): Promise<OperationsRequestDTO> {
  const res = await apiRequest<OperatorActionResponse>(
    `/api/ops/requests/${encodeURIComponent(id)}/action`,
    { method: 'POST', body: JSON.stringify({ action, note } satisfies OperatorActionRequest) },
  );
  return res.request;
}

/** POST /api/ops/simulate/event — generate a SIMULATED external event. */
export async function simulateEvent(input: SimulateEventRequest): Promise<SimulatedEventDTO> {
  const res = await apiRequest<SimulateEventResponse>(`/api/ops/simulate/event`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.event;
}

/** GET /api/ops/events — recent simulated events, newest-first. */
export async function fetchOpsEvents(limit = 50): Promise<SimulatedEventDTO[]> {
  const res = await apiRequest<SimulatedEventsResponse>(`/api/ops/events?limit=${limit}`);
  return res.events;
}

/**
 * POST /api/ops/movements/:requestId/reverse — reverse an already-POSTED money
 * movement (pending → posted → reversed). Operator/admin only (RBAC enforced
 * server-side). The `reason` is required; the backend flips the linked ledger
 * entry to `reversed` (balances stay derived — nothing is edited) and marks the
 * request's payload `reversed: true`. Returns the updated request. Throws
 * {@link ApiError} on `not_a_movement` (400), `nothing_to_reverse` (409), etc.
 * This reverses a SIMULATED ledger entry only — no real funds ever move.
 */
export async function reverseMovement(
  requestId: string,
  reason: string,
): Promise<OperationsRequestDTO> {
  const res = await apiRequest<{ request: OperationsRequestDTO }>(
    `/api/ops/movements/${encodeURIComponent(requestId)}/reverse`,
    { method: 'POST', body: JSON.stringify({ reason } satisfies ReverseMovementRequest) },
  );
  return res.request;
}

// ---- Simulation clock (v0.9.0) ----------------------------------------------
//
// The clock is a fake, operator-controlled "now". GET is open to any signed-in
// user (display only); advancing and listing every customer's schedules are
// ops_agent/admin only (RBAC enforced server-side). Advancing FIRES due
// scheduled payments — every fire is a real SIMULATED ledger entry.

/** GET /api/clock — the current simulated time + speed (display only). */
export function fetchClock(): Promise<ClockResponse> {
  return apiRequest<ClockResponse>('/api/clock');
}

/**
 * POST /api/ops/clock/advance — step the simulation clock FORWARD by the given
 * days/hours/minutes, firing every schedule that becomes due. Returns the new
 * clock plus a per-schedule summary of what fired. Throws {@link ApiError} on a
 * non-forward / out-of-range advance (validate with `validateAdvance` first).
 */
export function advanceClock(body: AdvanceClockRequest): Promise<AdvanceClockResponse> {
  return apiRequest<AdvanceClockResponse>('/api/ops/clock/advance', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** GET /api/ops/schedules — every customer's scheduled / recurring payments. */
export function fetchSchedules(): Promise<{ schedules: ScheduleDTO[] }> {
  return apiRequest<{ schedules: ScheduleDTO[] }>('/api/ops/schedules');
}
