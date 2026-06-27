import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  AUTH,
  SOCKET_EVENTS,
  type OpsExternalEventPayload,
  type OpsRequestChangedPayload,
  type SimHeartbeatPayload,
} from '@simbank/shared';
import { API_URL } from './api';

export interface OpsSocketHandlers {
  onRequestChanged?: (payload: OpsRequestChangedPayload) => void;
  onExternalEvent?: (payload: OpsExternalEventPayload) => void;
  /**
   * Periodic server heartbeat carrying the simulation clock (v0.9.0). Lets the
   * console show the live simulated date without polling. Optional + additive —
   * older callers that don't pass it are unaffected.
   */
  onHeartbeat?: (payload: SimHeartbeatPayload) => void;
}

/**
 * Subscribe to the operations real-time channel. Opens ONE Socket.IO connection
 * (with the session cookie, so the backend can admit this operator to the `ops`
 * room) and forwards the two operations events to the latest handlers. Handlers
 * are kept in a ref so changing them does not churn the connection.
 *
 * Returns the live connection state for a "Live / Reconnecting" indicator.
 */
export function useOpsSocket(handlers: OpsSocketHandlers): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      withCredentials: true,
      path: '/socket.io',
      // Declare the surface on the (polling) handshake so the backend admits this
      // operator to the ops room even when the browser omits Origin on a
      // same-origin handshake — same reasoning as the REST surface header.
      extraHeaders: { [AUTH.surfaceHeader]: 'operations' },
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(SOCKET_EVENTS.opsRequestChanged, (payload: OpsRequestChangedPayload) => {
      handlersRef.current.onRequestChanged?.(payload);
    });
    socket.on(SOCKET_EVENTS.opsExternalEvent, (payload: OpsExternalEventPayload) => {
      handlersRef.current.onExternalEvent?.(payload);
    });
    socket.on(SOCKET_EVENTS.heartbeat, (payload: SimHeartbeatPayload) => {
      handlersRef.current.onHeartbeat?.(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected };
}
