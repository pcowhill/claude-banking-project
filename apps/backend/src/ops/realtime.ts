import type { Server as SocketIOServer } from 'socket.io';
import {
  OPS_REALTIME_ROOM,
  SOCKET_EVENTS,
  type OperationsRequestDTO,
  type OpsExternalEventPayload,
  type OpsRequestChange,
  type OpsRequestChangedPayload,
  type SimulatedEventDTO,
} from '@simbank/shared';

/**
 * Publishes operations events to connected OPERATOR consoles (the `ops` room).
 * Defined as an interface so routes depend on the capability, not Socket.IO:
 *  - `SocketOpsRealtime` broadcasts over a real Socket.IO server (runtime).
 *  - `noopOpsRealtime` does nothing (the default; safe when no socket server is
 *    attached, e.g. `buildServer()` in tests via `app.inject`).
 *  - `RecordingOpsRealtime` captures emissions so tests can assert on them.
 *
 * Events are always sent to {@link OPS_REALTIME_ROOM} only, so a customer portal
 * socket sharing the same Socket.IO server never receives operator-facing data.
 */
export interface OpsRealtime {
  requestChanged(change: OpsRequestChange, request: OperationsRequestDTO): void;
  externalEvent(event: SimulatedEventDTO): void;
}

export const noopOpsRealtime: OpsRealtime = {
  requestChanged() {},
  externalEvent() {},
};

/** Socket.IO-backed publisher. Broadcasts to the operators room only. */
export class SocketOpsRealtime implements OpsRealtime {
  #io: SocketIOServer | null = null;

  /** Connect the live Socket.IO server once it has been attached. */
  bind(io: SocketIOServer): void {
    this.#io = io;
  }

  requestChanged(change: OpsRequestChange, request: OperationsRequestDTO): void {
    const payload: OpsRequestChangedPayload = { change, request };
    this.#io?.to(OPS_REALTIME_ROOM).emit(SOCKET_EVENTS.opsRequestChanged, payload);
  }

  externalEvent(event: SimulatedEventDTO): void {
    const payload: OpsExternalEventPayload = { event };
    this.#io?.to(OPS_REALTIME_ROOM).emit(SOCKET_EVENTS.opsExternalEvent, payload);
  }
}

/** A recording double for tests — captures emissions instead of broadcasting. */
export class RecordingOpsRealtime implements OpsRealtime {
  readonly changes: OpsRequestChangedPayload[] = [];
  readonly events: SimulatedEventDTO[] = [];

  requestChanged(change: OpsRequestChange, request: OperationsRequestDTO): void {
    this.changes.push({ change, request });
  }

  externalEvent(event: SimulatedEventDTO): void {
    this.events.push(event);
  }
}

/**
 * Parse a raw `Cookie:` header into a name→value map. Standalone (the Socket.IO
 * handshake has no `@fastify/cookie` parser) and tolerant of malformed pairs.
 * Session cookies are unsigned opaque tokens, so a plain parse is sufficient.
 */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** True for the bank-staff roles that may join the operators room. */
export function isOperatorRole(role: string): boolean {
  return role === 'ops_agent' || role === 'admin';
}
