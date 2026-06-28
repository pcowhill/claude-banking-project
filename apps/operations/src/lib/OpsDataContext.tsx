import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  countRequestsByStatus,
  type OperationsRequestDTO,
  type OpsAction,
  type SimulateEventRequest,
  type SimulatedEventDTO,
} from '@simbank/shared';
import { ApiError } from './api';
import {
  applyOpsAction,
  fetchClock,
  fetchOpsEvents,
  fetchOpsRequests,
  reverseMovement,
  simulateEvent,
} from './opsApi';
import { OpsDataContext, type OpsDataValue } from './ops-data-context';
import { useOpsSocket } from './useOpsSocket';

const MAX_EVENTS = 100;

/**
 * Owns the live operations data: one Socket.IO connection plus the in-memory
 * queue + simulated-event feed. Operator actions and simulated events update the
 * state optimistically; the socket echoes the same change back (idempotently, by
 * id) and also delivers OTHER operators' changes — so the console stays in sync
 * in real time.
 */
export function OpsDataProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<OperationsRequestDTO[]>([]);
  const [events, setEvents] = useState<SimulatedEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The live simulation-clock time (ISO). Driven by the socket heartbeat, with a
  // one-shot GET /api/clock on mount so the date shows before the first beat. (v0.9.0)
  const [simulationTime, setSimulationTime] = useState<string | null>(null);

  const counts = useMemo(() => countRequestsByStatus(requests), [requests]);

  const upsertRequest = useCallback((request: OperationsRequestDTO) => {
    setRequests((prev) => {
      const idx = prev.findIndex((r) => r.id === request.id);
      if (idx === -1) return [request, ...prev];
      const next = prev.slice();
      next[idx] = request;
      return next;
    });
  }, []);

  const prependEvent = useCallback((event: SimulatedEventDTO) => {
    setEvents((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev; // de-dupe socket echo
      return [event, ...prev].slice(0, MAX_EVENTS);
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [queue, feed] = await Promise.all([fetchOpsRequests(), fetchOpsEvents()]);
      setRequests(queue.requests);
      setEvents(feed);
      setError(null);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not load operations data — is the simulated backend running?';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Fallback seed for the simulation clock: fetch it once on mount so the date is
  // available immediately, then let the heartbeat keep it live. Best-effort — the
  // queue stays usable even if the clock endpoint is briefly unavailable.
  useEffect(() => {
    let cancelled = false;
    fetchClock()
      .then(({ clock }) => {
        if (!cancelled) setSimulationTime(clock.currentTime);
      })
      .catch(() => {
        /* heartbeat will fill it in; nothing to surface here */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { connected } = useOpsSocket({
    onRequestChanged: ({ request }) => upsertRequest(request),
    onExternalEvent: ({ event }) => prependEvent(event),
    onHeartbeat: ({ simulationTime: t }) => {
      if (t) setSimulationTime(t);
    },
  });

  const act = useCallback(
    async (id: string, action: OpsAction, note?: string) => {
      const updated = await applyOpsAction(id, action, note);
      upsertRequest(updated);
      return updated;
    },
    [upsertRequest],
  );

  const reverse = useCallback(
    async (id: string, reason: string) => {
      const updated = await reverseMovement(id, reason);
      upsertRequest(updated); // socket echo upserts the same change idempotently by id
      return updated;
    },
    [upsertRequest],
  );

  const simulate = useCallback(
    async (input: SimulateEventRequest) => {
      const event = await simulateEvent(input);
      prependEvent(event);
      return event;
    },
    [prependEvent],
  );

  const value = useMemo<OpsDataValue>(
    () => ({
      requests,
      counts,
      events,
      loading,
      error,
      connected,
      simulationTime,
      refresh,
      act,
      reverse,
      simulate,
    }),
    [requests, counts, events, loading, error, connected, simulationTime, refresh, act, reverse, simulate],
  );

  return <OpsDataContext.Provider value={value}>{children}</OpsDataContext.Provider>;
}
