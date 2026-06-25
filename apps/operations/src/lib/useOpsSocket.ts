import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type OpsExternalEventPayload,
  type OpsRequestChangedPayload,
} from '@simbank/shared';
import { API_URL } from './api';

export interface OpsSocketHandlers {
  onRequestChanged?: (payload: OpsRequestChangedPayload) => void;
  onExternalEvent?: (payload: OpsExternalEventPayload) => void;
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
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(SOCKET_EVENTS.opsRequestChanged, (payload: OpsRequestChangedPayload) => {
      handlersRef.current.onRequestChanged?.(payload);
    });
    socket.on(SOCKET_EVENTS.opsExternalEvent, (payload: OpsExternalEventPayload) => {
      handlersRef.current.onExternalEvent?.(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected };
}
