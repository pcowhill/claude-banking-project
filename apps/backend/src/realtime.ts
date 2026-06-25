import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { PLATFORM_META, SOCKET_EVENTS } from '@simbank/shared';
import { config } from './config';

/**
 * Attach a Socket.IO server to the running HTTP server. For the v0.1.0
 * foundation this just proves the real-time channel works: it greets each
 * client and emits a periodic heartbeat. Later milestones push live operations
 * events (approvals, fraud alerts, simulation-clock ticks) over this channel.
 */
export function attachRealtime(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    socket.emit(SOCKET_EVENTS.welcome, {
      ...PLATFORM_META,
      serverTime: new Date().toISOString(),
    });
  });

  const heartbeat = setInterval(() => {
    io.emit(SOCKET_EVENTS.heartbeat, { serverTime: new Date().toISOString() });
  }, 10_000);
  // Don't let the heartbeat keep the process alive during shutdown.
  heartbeat.unref();

  return io;
}
