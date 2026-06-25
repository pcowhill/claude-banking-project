import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS, sessionCookieName, type OperationsRequestDTO } from '@simbank/shared';
import { buildServer } from './server';
import { attachRealtime } from './realtime';
import { SocketOpsRealtime } from './ops/realtime';
import { prisma } from './db';
import { DEMO, seedDemo, sessionCookieValue } from './test/fixtures';

/**
 * Integration test for the socket-room RBAC — the single control that keeps
 * operator-facing real-time payloads off customer/anonymous sockets that share
 * this one Socket.IO server. It boots `attachRealtime` on an ephemeral port and
 * uses REAL socket.io-client connections to prove the handshake/join path:
 *  - an authenticated operator session joins the room and receives ops events;
 *  - a customer-origin session and an unauthenticated socket do NOT;
 *  - all three still receive the public `welcome` greeting.
 */
const OPS_ORIGIN = 'http://localhost:5174';
const CUST_ORIGIN = 'http://localhost:5173';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('socket connect timeout')), 4000);
  });
}

describe('operations socket room RBAC (v0.5.0)', () => {
  let app: FastifyInstance;
  let io: SocketIOServer;
  let opsRealtime: SocketOpsRealtime;
  let baseUrl = '';

  beforeAll(async () => {
    app = await buildServer();
    opsRealtime = new SocketOpsRealtime();
    io = attachRealtime(app.server, prisma);
    opsRealtime.bind(io);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    await seedDemo();
  });

  afterAll(async () => {
    io.close();
    await app.close();
  });

  async function loginCookie(email: string, password: string, origin: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { email, password },
    });
    const value = sessionCookieValue(res);
    const name = origin === OPS_ORIGIN ? sessionCookieName('operations') : sessionCookieName('customer');
    return `${name}=${value}`;
  }

  function connect(cookie: string | undefined, origin: string): Socket {
    const extraHeaders: Record<string, string> = { Origin: origin };
    if (cookie) extraHeaders.Cookie = cookie;
    return ioClient(baseUrl, {
      path: '/socket.io',
      extraHeaders,
      transports: ['polling', 'websocket'],
      reconnection: false,
      forceNew: true,
    });
  }

  it('scopes ops events to operator sockets only, while all sockets get welcome', async () => {
    const opsCookie = await loginCookie(DEMO.ops.email, DEMO.ops.password, OPS_ORIGIN);
    const custCookie = await loginCookie(DEMO.customer.email, DEMO.customer.password, CUST_ORIGIN);

    const opsSocket = connect(opsCookie, OPS_ORIGIN);
    const custSocket = connect(custCookie, CUST_ORIGIN);
    const anonSocket = connect(undefined, OPS_ORIGIN);
    const sockets = [opsSocket, custSocket, anonSocket];

    const opsEvents: unknown[] = [];
    const custEvents: unknown[] = [];
    const anonEvents: unknown[] = [];
    const welcomes = { ops: false, cust: false, anon: false };

    opsSocket.on(SOCKET_EVENTS.welcome, () => (welcomes.ops = true));
    custSocket.on(SOCKET_EVENTS.welcome, () => (welcomes.cust = true));
    anonSocket.on(SOCKET_EVENTS.welcome, () => (welcomes.anon = true));
    opsSocket.on(SOCKET_EVENTS.opsRequestChanged, (p) => opsEvents.push(p));
    custSocket.on(SOCKET_EVENTS.opsRequestChanged, (p) => custEvents.push(p));
    anonSocket.on(SOCKET_EVENTS.opsRequestChanged, (p) => anonEvents.push(p));

    try {
      await Promise.all(sockets.map(waitForConnect));
      // Let the async cookie-resolve + room-join settle.
      await delay(500);

      // Broadcast an ops event through the real publisher.
      opsRealtime.requestChanged('updated', { id: 'rt-test' } as OperationsRequestDTO);
      await delay(400);

      // Only the operator socket joined the ops room.
      expect(opsEvents.some((p) => (p as { request?: { id?: string } }).request?.id === 'rt-test')).toBe(true);
      expect(custEvents).toHaveLength(0);
      expect(anonEvents).toHaveLength(0);

      // The public greeting still reaches everyone.
      expect(welcomes).toEqual({ ops: true, cust: true, anon: true });
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  });
});
