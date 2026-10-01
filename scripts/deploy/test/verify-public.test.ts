// verify-public.mjs against local stand-ins: an HTTP server that behaves like
// Caddy in front of the backend (SPA fallback, X-Robots-Tag, /status,
// /socket.io polling handshake) and an HTTPS server with a self-signed
// certificate (the preflight must REFUSE it — TLS verification is never off).
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEPLOY_DIR, fakeSha, makeTmp } from './helpers';

const SHA = fakeSha('live');
const NOTICE = 'This is a shared public simulation. Use fictional information…';

interface SiteState {
  status: Record<string, unknown>;
  robotsHeader: boolean;
  notice: boolean;
}
const defaults = (): SiteState => ({
  status: {
    status: 'ok',
    publicDemo: true,
    isSimulation: true,
    version: '1.0.0',
    environment: 'production',
    revision: SHA,
    database: { connected: true, users: 4, accounts: 4 },
  },
  robotsHeader: true,
  notice: true,
});

let state = defaults();
let server: Server;
let base: string;

function startFakeSite(): Promise<void> {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (status: number, type: string, body: string, staticFile = true) => {
      const headers: Record<string, string> = { 'content-type': type };
      // Caddy adds the header to static responses; the backend to its own.
      if (!staticFile || state.robotsHeader) headers['x-robots-tag'] = 'noindex, nofollow';
      res.writeHead(status, headers).end(body);
    };
    if (url.pathname === '/status')
      return send(200, 'application/json', JSON.stringify(state.status), false);
    if (url.pathname === '/health')
      return send(200, 'application/json', '{"status":"ok","uptimeSeconds":1}', false);
    if (url.pathname === '/socket.io/') {
      return send(
        200,
        'text/plain',
        '0{"sid":"abc","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}',
        false,
      );
    }
    if (url.pathname === '/robots.txt')
      return send(200, 'text/plain', 'User-agent: *\nDisallow: /\n');
    if (url.pathname === '/assets/index-x.js')
      return send(200, 'text/javascript', state.notice ? `"${NOTICE}"` : '"hello"');
    return send(
      200,
      'text/html',
      '<!doctype html><meta name="robots" content="noindex, nofollow"><div id="root"></div><script type="module" crossorigin src="/assets/index-x.js"></script>',
    );
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

/** Run verify-public.mjs asynchronously (the fake site lives in this process). */
function verify(args: string[]): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(DEPLOY_DIR, 'verify-public.mjs'), ...args], {
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (status) => resolve({ status, out }));
  });
}

const live = (extra: string[] = []) =>
  verify([
    'live',
    '--customer',
    base,
    '--operations',
    base,
    '--attempts',
    '1',
    '--interval',
    '1',
    ...extra,
  ]);

describe('verify-public.mjs', () => {
  beforeAll(startFakeSite);
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    state = defaults();
  });

  it('live: passes when both sites, /status, the SPA routes, the notice and Socket.IO check out', async () => {
    const { status, out } = await live(['--expect-revision', SHA]);
    expect(status, out).toBe(0);
    for (const path of [
      '/dashboard',
      '/queues',
      '/robots.txt',
      '/socket.io polling handshake ok',
      'public-demo warning',
    ]) {
      expect(out).toContain(path);
    }
    expect(out).toContain('public verification OK');
  });

  it('live: fails when the deployed revision is not the expected one', async () => {
    const { status, out } = await live(['--expect-revision', fakeSha('other')]);
    expect(status).toBe(1);
    expect(out).toMatch(/reports revision .* expected/);
  });

  it('live: fails unless publicDemo is true', async () => {
    state.status.publicDemo = false;
    const { status, out } = await live();
    expect(status).toBe(1);
    expect(out).toMatch(/publicDemo=false/);
  });

  it('live: fails when the database is not connected (degraded)', async () => {
    state.status = { ...state.status, status: 'degraded', database: { connected: false } };
    const { status } = await live();
    expect(status).toBe(1);
  });

  it('live: fails when static responses lack X-Robots-Tag', async () => {
    state.robotsHeader = false;
    const { status, out } = await live();
    expect(status).toBe(1);
    expect(out).toMatch(/lacks "X-Robots-Tag: noindex, nofollow"/);
  });

  it('live: fails when the served bundle lacks the public-demo warning', async () => {
    state.notice = false;
    const { status, out } = await live();
    expect(status).toBe(1);
    expect(out).toMatch(/does not contain the public-demo warning/);
  });

  it('backend: checks /health, /status and the Engine.IO handshake', async () => {
    const { status, out } = await verify([
      'backend',
      '--url',
      base,
      '--expect-revision',
      SHA,
      '--attempts',
      '1',
    ]);
    expect(status, out).toBe(0);
    expect(out).toContain('backend checks OK');
  });

  it('preflight: refuses plain http and never disables TLS verification', async () => {
    const plain = await verify([
      'preflight',
      '--customer',
      base,
      '--operations',
      base,
      '--attempts',
      '1',
      '--interval',
      '1',
    ]);
    expect(plain.status).toBe(1);
    expect(plain.out).toMatch(/requires https/);
  });

  it.skipIf(spawnSync('bash', ['-c', 'command -v openssl'], { stdio: 'ignore' }).status !== 0)(
    'preflight: rejects an untrusted (self-signed) certificate',
    async () => {
      const dir = makeTmp('tls');
      try {
        const gen = spawnSync('openssl', [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-keyout',
          join(dir, 'key.pem'),
          '-out',
          join(dir, 'cert.pem'),
        ]);
        expect(gen.status).toBe(0);
        const https = createHttpsServer(
          { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
          (_req, res) => res.writeHead(404).end(),
        );
        await new Promise<void>((r) => https.listen(0, '127.0.0.1', () => r()));
        const origin = `https://localhost:${(https.address() as AddressInfo).port}`;
        const { status, out } = await verify([
          'preflight',
          '--customer',
          origin,
          '--operations',
          origin,
          '--attempts',
          '1',
          '--interval',
          '1',
        ]);
        https.close();
        expect(status).toBe(1);
        expect(out).toMatch(/TLS (certificate not trusted|handshake failed)/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
