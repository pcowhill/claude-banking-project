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
} as const;
