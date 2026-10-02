#!/usr/bin/env node
// Meridian deployment — HTTP verification (no secrets, read-only requests).
//
//   node scripts/deploy/verify-public.mjs preflight
//       DNS + trusted TLS for both public hostnames, BEFORE `current` changes.
//       Any HTTP status is acceptable (before the first deployment Caddy answers
//       404 for pages and 502 for backend paths); TLS verification is never
//       disabled.
//
//   node scripts/deploy/verify-public.mjs live [--expect-revision <sha>]
//       Post-deployment checks against both public sites (with retries):
//       /status (status ok, publicDemo true, database.connected true, and the
//       expected revision), /health, the SPA routes, X-Robots-Tag on static
//       responses, the public-demo warning inside the served bundle, robots.txt
//       and an anonymous Engine.IO polling handshake on /socket.io/.
//
//   node scripts/deploy/verify-public.mjs backend --url http://127.0.0.1:<port> [--expect-revision <sha>]
//       Backend-only checks (used by the packaged-release smoke test).
//
// Options: --customer <origin> --operations <origin> override the public
// origins (tests only); --attempts N / --interval S tune the /status polling.
import { lookup } from 'node:dns/promises';
import { connect } from 'node:tls';

const DEFAULTS = {
  customer: 'https://banking.cowhill.dev',
  operations: 'https://banking-ops.cowhill.dev',
  attempts: 36,
  interval: 5,
};
const NOTICE = 'This is a shared public simulation';
const REQUEST_TIMEOUT_MS = 15_000;

class CheckError extends Error {}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const args = { mode, ...DEFAULTS };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    const value = rest[i + 1];
    switch (key) {
      case '--customer':
      case '--operations':
      case '--url':
        args[key.slice(2)] = value.replace(/\/+$/, '');
        i++;
        break;
      case '--expect-revision':
        if (!/^[0-9a-f]{40}$/.test(value ?? ''))
          usage(`--expect-revision must be a full commit SHA`);
        args.expectRevision = value;
        i++;
        break;
      case '--attempts':
      case '--interval':
        args[key.slice(2)] = Number(value);
        if (!Number.isInteger(args[key.slice(2)]) || args[key.slice(2)] < 1)
          usage(`${key} must be a positive integer`);
        i++;
        break;
      default:
        usage(`unknown argument ${key}`);
    }
  }
  if (!['preflight', 'live', 'backend'].includes(mode))
    usage('mode must be preflight, live or backend');
  if (mode === 'backend' && !args.url) usage('backend mode needs --url');
  return args;
}

function usage(message) {
  console.error(`[verify] ${message}`);
  console.error(
    'usage: verify-public.mjs preflight | live [--expect-revision <sha>] | backend --url <url> [--expect-revision <sha>]',
  );
  process.exit(64);
}

const log = (message) => console.log(`[verify] ${message}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, init = {}) {
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'user-agent': 'meridian-deploy-verify (GitHub Actions)', ...(init.headers ?? {}) },
    ...init,
  });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

/** Retry `fn` until it stops throwing CheckError/network errors. */
async function retry(label, fn, { attempts, interval }) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const reason =
        err instanceof CheckError ? err.message : `${err.name}: ${err.cause?.code ?? err.message}`;
      log(`${label}: attempt ${i}/${attempts} not yet OK — ${reason}`);
      if (i < attempts) await sleep(interval * 1000);
    }
  }
  throw new CheckError(`${label} failed after ${attempts} attempts: ${last?.message ?? last}`);
}

function expect(condition, message) {
  if (!condition) throw new CheckError(message);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkStatus(base, expectRevision) {
  const res = await request(`${base}/status`);
  expect(res.status === 200, `${base}/status answered HTTP ${res.status}`);
  let json;
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new CheckError(`${base}/status did not return JSON`);
  }
  expect(json.status === 'ok', `${base}/status reports status=${JSON.stringify(json.status)}`);
  expect(
    json.database?.connected === true,
    `${base}/status reports database.connected=${json.database?.connected}`,
  );
  expect(json.publicDemo === true, `${base}/status reports publicDemo=${json.publicDemo}`);
  expect(json.isSimulation === true, `${base}/status does not report isSimulation=true`);
  if (expectRevision) {
    expect(
      json.revision === expectRevision,
      `${base}/status reports revision ${json.revision}, expected ${expectRevision}`,
    );
  }
  const robots = res.headers.get('x-robots-tag') ?? '';
  expect(/noindex/i.test(robots), `${base}/status lacks the API X-Robots-Tag header`);
  return json;
}

async function checkHealth(base) {
  const res = await request(`${base}/health`);
  expect(res.status === 200, `${base}/health answered HTTP ${res.status}`);
  expect(JSON.parse(res.body).status === 'ok', `${base}/health is not ok`);
}

async function checkSocketIo(base) {
  const res = await request(`${base}/socket.io/?EIO=4&transport=polling`);
  expect(res.status === 200, `${base}/socket.io polling handshake answered HTTP ${res.status}`);
  // Engine.IO v4 "open" packet: '0' followed by the handshake JSON.
  expect(res.body.startsWith('0{'), `${base}/socket.io handshake is not an Engine.IO open packet`);
  const handshake = JSON.parse(res.body.slice(1));
  expect(
    typeof handshake.sid === 'string' && handshake.sid.length > 0,
    `${base}/socket.io handshake has no sid`,
  );
  return handshake;
}

function expectNoIndexHeader(url, res) {
  const value = (res.headers.get('x-robots-tag') ?? '').toLowerCase();
  expect(
    value.includes('noindex') && value.includes('nofollow'),
    `${url} lacks "X-Robots-Tag: noindex, nofollow" (got "${value}")`,
  );
}

/** An SPA route: HTTP 200 HTML shell with the robots meta tag and X-Robots-Tag. Returns the HTML. */
async function checkSpaRoute(base, path) {
  const url = `${base}${path}`;
  const res = await request(url);
  expect(res.status === 200, `${url} answered HTTP ${res.status}`);
  expect((res.headers.get('content-type') ?? '').includes('text/html'), `${url} is not HTML`);
  expect(res.body.includes('id="root"'), `${url} is not the SPA shell`);
  expect(/<meta[^>]+name="robots"[^>]+noindex/i.test(res.body), `${url} lacks the robots meta tag`);
  expectNoIndexHeader(url, res);
  return res.body;
}

/** The module script of the SPA must carry the shared public-demo warning. */
async function checkBundleNotice(base, html) {
  const match = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/);
  expect(match, `${base}/ references no /assets/*.js bundle`);
  const url = `${base}${match[1]}`;
  const res = await request(url);
  expect(res.status === 200, `${url} answered HTTP ${res.status}`);
  expectNoIndexHeader(url, res);
  expect(res.body.includes(NOTICE), `${url} does not contain the public-demo warning`);
}

async function checkRobotsTxt(base) {
  const url = `${base}/robots.txt`;
  const res = await request(url);
  expect(res.status === 200, `${url} answered HTTP ${res.status}`);
  expect(/Disallow:\s*\//.test(res.body), `${url} does not disallow crawling`);
}

/** DNS + trusted TLS handshake (certificate verified against the hostname). */
async function checkDnsAndTls(origin) {
  const { hostname, port } = new URL(origin);
  const addresses = await lookup(hostname, { all: true });
  expect(addresses.length > 0, `${hostname} does not resolve`);
  log(`${hostname} resolves to ${addresses.map((a) => a.address).join(', ')}`);
  const cert = await new Promise((resolvePromise, reject) => {
    const options = {
      host: hostname,
      port: Number(port) || 443,
      servername: hostname,
      rejectUnauthorized: true,
      timeout: REQUEST_TIMEOUT_MS,
    };
    const socket = connect(options, () => {
      const peer = socket.getPeerCertificate();
      const authorized = socket.authorized;
      socket.end();
      if (!authorized)
        reject(
          new CheckError(`${hostname}: TLS certificate not trusted (${socket.authorizationError})`),
        );
      else resolvePromise(peer);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new CheckError(`${hostname}: TLS handshake timed out`));
    });
    socket.on('error', (err) =>
      reject(new CheckError(`${hostname}: TLS handshake failed (${err.code ?? err.message})`)),
    );
  });
  log(
    `${hostname} TLS OK — issuer "${cert.issuer?.O ?? cert.issuer?.CN}", valid until ${cert.valid_to}`,
  );
  const res = await request(`${origin}/`);
  log(
    `${origin}/ answered HTTP ${res.status} (any status is acceptable before the deployment switches current)`,
  );
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/** Retries for checks that should pass at once (bounded by --attempts/--interval). */
const quickRetry = (args) => ({
  attempts: Math.min(5, args.attempts),
  interval: Math.min(3, args.interval),
});

async function preflight(args) {
  for (const origin of [args.customer, args.operations]) {
    if (!origin.startsWith('https://'))
      throw new CheckError(`${origin}: the public preflight requires https://`);
    await retry(`DNS/TLS ${origin}`, () => checkDnsAndTls(origin), quickRetry(args));
  }
  log('preflight OK — both hostnames resolve and present trusted certificates');
}

async function backend(args) {
  const status = await retry(
    `${args.url}/status`,
    async () => {
      await checkHealth(args.url);
      return checkStatus(args.url, args.expectRevision);
    },
    args,
  );
  log(
    `backend /health ok; /status ok (version ${status.version}, environment ${status.environment}, revision ${status.revision}, ${status.database.users} users)`,
  );
  const handshake = await checkSocketIo(args.url);
  log(`backend Socket.IO polling handshake ok (upgrades: ${JSON.stringify(handshake.upgrades)})`);
  log('backend checks OK');
}

async function live(args) {
  const quick = quickRetry(args);
  const status = await retry(
    `${args.customer}/status`,
    () => checkStatus(args.customer, args.expectRevision),
    args,
  );
  log(
    `customer /status ok — version ${status.version}, revision ${status.revision}, publicDemo ${status.publicDemo}, database connected`,
  );
  await retry(
    `${args.operations}/status`,
    () => checkStatus(args.operations, args.expectRevision),
    quick,
  );
  log('operations /status ok (same backend)');

  const pages = [
    [args.customer, ['/', '/dashboard']],
    [args.operations, ['/', '/queues']],
  ];
  for (const [base, paths] of pages) {
    await retry(`${base}/health`, () => checkHealth(base), quick);
    log(`${base}/health ok`);
    for (const path of paths) {
      const html = await retry(`${base}${path}`, () => checkSpaRoute(base, path), quick);
      log(`${base}${path} ok (HTTP 200 SPA shell, X-Robots-Tag noindex, nofollow)`);
      if (path === '/') {
        await retry(`${base} bundle`, () => checkBundleNotice(base, html), quick);
        log(`${base} bundle carries the public-demo warning`);
      }
    }
    await retry(`${base}/robots.txt`, () => checkRobotsTxt(base), quick);
    log(`${base}/robots.txt disallows crawling`);
    const handshake = await retry(`${base}/socket.io`, () => checkSocketIo(base), quick);
    log(`${base}/socket.io polling handshake ok (upgrades: ${JSON.stringify(handshake.upgrades)})`);
  }
  log('public verification OK');
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args.mode === 'preflight') await preflight(args);
  else if (args.mode === 'backend') await backend(args);
  else await live(args);
} catch (err) {
  console.error(`[verify] FAILED: ${err.message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${err.message}`);
  process.exit(1);
}
