import { createContext, useContext } from 'react';
import type {
  OperationsRequestDTO,
  OpsAction,
  OpsStatusCounts,
  SimulateEventRequest,
  SimulatedEventDTO,
} from '@simbank/shared';

/**
 * Live operations data shared across the console (dashboard, queues, messaging).
 * A single provider owns one Socket.IO connection + the in-memory queue and
 * simulated-event feed, so every screen reflects the same real-time state and we
 * never open redundant sockets. The `OpsDataProvider` component lives in
 * `./OpsDataContext` (this split keeps React Fast Refresh happy).
 */
export interface OpsDataValue {
  /** The whole queue (screens filter client-side); kept live over the socket. */
  requests: OperationsRequestDTO[];
  /** Status counts derived from the whole queue. */
  counts: OpsStatusCounts;
  /** Recent simulated external events, newest-first. */
  events: SimulatedEventDTO[];
  /** True until the initial load resolves. */
  loading: boolean;
  /** Human-readable error when the initial load failed (e.g. API offline). */
  error: string | null;
  /** Live Socket.IO connection state, for the "Live / Reconnecting" indicator. */
  connected: boolean;
  /**
   * The current SIMULATION-clock time (ISO), or null before the first reading.
   * Updated live by the socket heartbeat (~every 10s) with a one-shot fetch on
   * mount as a fallback. This is the fake operator-controlled "now", NOT the
   * wall clock. (v0.9.0)
   */
  simulationTime: string | null;
  /** Re-fetch the queue + event feed from the backend. */
  refresh: () => Promise<void>;
  /** Apply an operator action; resolves with the updated request. Throws ApiError. */
  act: (id: string, action: OpsAction, note?: string) => Promise<OperationsRequestDTO>;
  /**
   * Reverse an already-posted money movement (post-decision capability, not one
   * of the four decisions). Resolves with the updated request. Throws ApiError.
   */
  reverse: (id: string, reason: string) => Promise<OperationsRequestDTO>;
  /** Generate a SIMULATED external event; resolves with it. Throws ApiError. */
  simulate: (input: SimulateEventRequest) => Promise<SimulatedEventDTO>;
}

export const OpsDataContext = createContext<OpsDataValue | null>(null);

/** Access the live operations data. Must be used inside an `OpsDataProvider`. */
export function useOpsData(): OpsDataValue {
  const ctx = useContext(OpsDataContext);
  if (!ctx) {
    throw new Error('useOpsData must be used within an OpsDataProvider');
  }
  return ctx;
}
