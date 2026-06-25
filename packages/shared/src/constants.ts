/**
 * Shared, environment-independent constants. Network ports are the recommended
 * local defaults documented in the README; the backend reads its real port from
 * the environment at runtime, these are for client defaults and docs.
 */
export const DEFAULT_PORTS = {
  backend: 3000,
  customer: 5173,
  operations: 5174,
} as const;

export const LOCAL_URLS = {
  backend: `http://localhost:${DEFAULT_PORTS.backend}`,
  customer: `http://localhost:${DEFAULT_PORTS.customer}`,
  operations: `http://localhost:${DEFAULT_PORTS.operations}`,
} as const;

/** Default currency for the simulation. Single-currency for now. */
export const DEFAULT_CURRENCY = 'USD';

/** Socket.IO event names shared between server and clients. */
export const SOCKET_EVENTS = {
  /** Server -> client greeting sent on connect with platform meta + time. */
  welcome: 'sim:welcome',
  /** Server -> client periodic heartbeat carrying the simulation clock. */
  heartbeat: 'sim:heartbeat',
  /**
   * Server -> OPERATOR client: an operations request was created or updated
   * (payload: `OpsRequestChangedPayload`). Emitted to the operators room only —
   * customer clients never receive it (see `OPS_REALTIME_ROOM`).
   */
  opsRequestChanged: 'ops:request_changed',
  /**
   * Server -> OPERATOR client: a SIMULATED external event (SMS/email/MFA/identity)
   * was generated (payload: `OpsExternalEventPayload`). Operators room only.
   */
  opsExternalEvent: 'ops:external_event',
} as const;

/**
 * Socket.IO room that authenticated bank-staff (ops_agent / admin) consoles join
 * on connect. Operations events are broadcast to THIS room only, so a customer
 * portal socket — which shares the same Socket.IO server — never receives
 * operator-facing data. Membership is decided server-side from the operations
 * session cookie at handshake time (see `apps/backend/src/realtime.ts`).
 */
export const OPS_REALTIME_ROOM = 'ops';
