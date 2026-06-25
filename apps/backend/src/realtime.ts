import type { Server as HttpServer } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { OPS_REALTIME_ROOM, PLATFORM_META, SOCKET_EVENTS, sessionCookieName } from '@simbank/shared';
import { config } from './config';
import { sessionAudienceForOrigin } from './auth/cookies';
import { resolveSession } from './auth/sessions';
import { isOperatorRole, parseCookieHeader } from './ops/realtime';

/**
 * Attach a Socket.IO server to the running HTTP server. It greets each client,
 * emits a periodic heartbeat, and — new in v0.5.0 — admits authenticated bank
 * staff to the operators room so operations events can be pushed to them.
 *
 * Room RBAC: on connect we read the OPERATIONS session cookie from the handshake
 * (only for sockets whose Origin is the ops console) and resolve it. Only an
 * `ops_agent`/`admin` session joins {@link OPS_REALTIME_ROOM}; everyone else —
 * logged out, a customer portal socket, or a customer-role session — connects
 * for welcome/heartbeat but NEVER joins the ops room, so they never receive
 * operator-facing payloads even though both apps share this one Socket.IO server.
 */
export function attachRealtime(httpServer: HttpServer, prisma: PrismaClient): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    socket.emit(SOCKET_EVENTS.welcome, {
      ...PLATFORM_META,
      serverTime: new Date().toISOString(),
    });
    // Best-effort: decide ops-room membership from the session cookie.
    void joinOpsRoomIfOperator(socket, prisma);
  });

  const heartbeat = setInterval(() => {
    io.emit(SOCKET_EVENTS.heartbeat, { serverTime: new Date().toISOString() });
  }, 10_000);
  // Don't let the heartbeat keep the process alive during shutdown.
  heartbeat.unref();

  return io;
}

/**
 * Join a socket to the operators room iff it carries a valid operations session
 * for a staff role. Failures are swallowed — a socket that can't be authenticated
 * simply stays out of the ops room (least privilege).
 */
async function joinOpsRoomIfOperator(socket: Socket, prisma: PrismaClient): Promise<void> {
  try {
    const origin = socket.handshake.headers.origin;
    if (sessionAudienceForOrigin(origin) !== 'operations') return;

    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies[sessionCookieName('operations')];
    if (!token) return;

    const resolved = await resolveSession(prisma, token, new Date());
    if (!resolved || !isOperatorRole(resolved.user.role)) return;

    await socket.join(OPS_REALTIME_ROOM);
    socket.data.opsUserId = resolved.user.id;
  } catch {
    // best-effort; never throw out of a connection handler
  }
}
