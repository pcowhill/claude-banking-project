// The server-side release script (remote/meridian-release.sh), streamed into
// `bash -s` exactly as in production, against a temporary contract tree with
// a fake service helper. Covers publication, reruns, the rollback target, the
// locked compare-and-swap switch, verification and pruning.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REMOTE_SCRIPT,
  fakeSha,
  makeServer,
  output,
  runRemote,
  shellToolsAvailable,
  writeRelease,
  type FakeServer,
} from './helpers';

const A = fakeSha('a');
const B = fakeSha('b');
const C = fakeSha('c');

describe.skipIf(!shellToolsAvailable)('server-side release script', () => {
  let server: FakeServer;
  beforeEach(() => {
    server = makeServer();
  });
  afterEach(() => server.cleanup());

  const remote = (...args: string[]) => runRemote(args, server.env);
  const ok = (...args: string[]) => {
    const result = remote(...args);
    expect(result.status, output(result)).toBe(0);
    return result.stdout;
  };
  const point = (sha: string) => {
    const link = join(server.appRoot, 'current');
    rmSync(link, { force: true });
    symlinkSync(join(server.appRoot, 'releases', sha), link);
  };

  describe('usage', () => {
    it('rejects unknown actions and malformed SHAs before doing anything', () => {
      expect(remote('rm', '-rf').status).toBe(64);
      expect(remote('publish').status).toBe(64);
      const bad = remote('publish', 'HEAD; rm -rf /');
      expect(bad.status).toBe(1);
      expect(output(bad)).toMatch(/not a full lowercase 40-character commit SHA/);
    });
  });

  describe('preflight', () => {
    it('checks the directories, the lock, the helper status and free space', () => {
      const out = ok('preflight', '1');
      expect(out).toContain('current=none');
      expect(out).toContain('ActiveState=inactive'); // first deployment: expected
      expect(out).toContain('preflight: OK');
      expect(server.helperCalls()).toEqual(['status lock=free current=none']);
    });

    it('fails when there is not enough free space', () => {
      const result = remote('preflight', String(1024 ** 4));
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/not enough free space/);
    });

    it('fails when the infrastructure is not in place', () => {
      rmSync(join(server.root, 'run', 'lock', 'cowhill-meridian.lock'));
      expect(output(remote('preflight', '1'))).toMatch(/cowhill-meridian\.lock is missing/);
    });
  });

  describe('publish', () => {
    it('validates incoming/<sha>, moves it to releases/<sha>, normalises modes and writes .release-ready last', () => {
      writeRelease(join(server.appRoot, 'incoming', A), A);
      const out = ok('publish', A);
      expect(out).toContain('published=new');
      const release = join(server.appRoot, 'releases', A);
      expect(existsSync(join(server.appRoot, 'incoming', A))).toBe(false);
      expect(existsSync(join(release, '.release-ready'))).toBe(true);
      expect(readFileSync(join(release, 'REVISION'), 'utf8')).toBe(A);
      // u=rwX,go=rX: the engine library keeps its executable bits, data files stay 0644.
      expect(
        statSync(
          join(release, 'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node'),
        ).mode & 0o777,
      ).toBe(0o755);
      expect(statSync(join(release, 'customer', 'index.html')).mode & 0o777).toBe(0o644);
      // The marker is the newest thing in the release.
      const marker = statSync(join(release, '.release-ready')).mtimeMs;
      expect(marker).toBeGreaterThanOrEqual(statSync(join(release, 'REVISION')).mtimeMs);
    });

    it('refuses an invalid upload and publishes nothing', () => {
      const incoming = writeRelease(join(server.appRoot, 'incoming', A), A);
      symlinkSync('/etc/hostname', join(incoming, 'customer', 'leak.txt'));
      const result = remote('publish', A);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/symbolic link in the release/);
      expect(existsSync(join(server.appRoot, 'releases', A))).toBe(false);
    });

    it('refuses an upload that already carries .release-ready', () => {
      const incoming = writeRelease(join(server.appRoot, 'incoming', A), A);
      writeFileSync(join(incoming, '.release-ready'), '');
      expect(remote('publish', A).status).toBe(1);
      expect(existsSync(join(server.appRoot, 'releases', A))).toBe(false);
    });

    it('reuses an existing ready release unchanged (rerun) and discards the new upload', () => {
      const release = server.publishReady(A);
      const before = statSync(join(release, '.release-ready')).mtimeMs;
      writeRelease(join(server.appRoot, 'incoming', A), A);
      writeFileSync(
        join(server.appRoot, 'incoming', A, 'customer', 'extra.txt'),
        'should not appear',
      );
      expect(ok('publish', A)).toContain('published=reused');
      expect(existsSync(join(release, 'customer', 'extra.txt'))).toBe(false);
      expect(statSync(join(release, '.release-ready')).mtimeMs).toBe(before);
      expect(existsSync(join(server.appRoot, 'incoming', A))).toBe(false);
    });

    it('replaces an incomplete (not ready, not current) release left by an earlier run', () => {
      const stale = join(server.appRoot, 'releases', A);
      mkdirSync(join(stale, 'half-copied'), { recursive: true });
      writeRelease(join(server.appRoot, 'incoming', A), A);
      ok('publish', A);
      expect(existsSync(join(stale, 'half-copied'))).toBe(false);
      expect(existsSync(join(stale, '.release-ready'))).toBe(true);
    });

    it('never touches the release current points at, even if it is not ready', () => {
      const broken = join(server.appRoot, 'releases', A);
      mkdirSync(broken, { recursive: true });
      writeFileSync(join(broken, 'keep-me'), '');
      point(A);
      writeRelease(join(server.appRoot, 'incoming', A), A);
      const result = remote('publish', A);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/CURRENT release but is not ready/);
      expect(existsSync(join(broken, 'keep-me'))).toBe(true);
    });
  });

  describe('rollback target', () => {
    it('is none on the first deployment', () => {
      const out = ok('rollback-target', A);
      expect(out).toContain('current=none');
      expect(out).toContain('previous=none');
    });

    it('is the current ready release when it is a different, valid release', () => {
      server.publishReady(A);
      point(A);
      const out = ok('rollback-target', B);
      expect(out).toContain(`current=${A}`);
      expect(out).toContain(`previous=${A}`);
    });

    it('is none when current already is the new release (redeploy)', () => {
      server.publishReady(A);
      point(A);
      expect(ok('rollback-target', A)).toContain('previous=none');
    });

    it('is none when the current release is not ready', () => {
      const release = server.publishReady(A);
      rmSync(join(release, '.release-ready'));
      point(A);
      expect(ok('rollback-target', B)).toContain('previous=none');
    });

    it('is none when the current release REVISION does not match its name', () => {
      const release = server.publishReady(A);
      writeFileSync(join(release, 'REVISION'), C);
      point(A);
      expect(ok('rollback-target', B)).toContain('previous=none');
    });

    it('fails when current points outside releases/', () => {
      const elsewhere = join(server.root, 'elsewhere');
      mkdirSync(elsewhere);
      symlinkSync(elsewhere, join(server.appRoot, 'current'));
      const result = remote('rollback-target', B);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/does not resolve to a directory directly under/);
    });
  });

  describe('switch (under the shared lock)', () => {
    const lockFile = () => join(server.root, 'run', 'lock', 'cowhill-meridian.lock');

    it('points current at the new release atomically and leaves no temporary link', () => {
      server.publishReady(A);
      ok('switch', A, 'none');
      expect(readlinkSync(join(server.appRoot, 'current'))).toBe(
        join(server.appRoot, 'releases', A),
      );
      expect(
        spawnSync('bash', ['-c', `ls -A '${server.appRoot}' | grep -c current.tmp || true`], {
          encoding: 'utf8',
        }).stdout.trim(),
      ).toBe('0');
      server.publishReady(B);
      ok('switch', B, A);
      expect(server.current()).toBe(B);
    });

    it('refuses a release that is not ready', () => {
      mkdirSync(join(server.appRoot, 'releases', A), { recursive: true });
      const result = remote('switch', A, 'none');
      expect(result.status).toBe(1);
      expect(server.current()).toBeNull();
    });

    it('compare-and-swap: exits 3 without switching when current changed', () => {
      server.publishReady(A);
      server.publishReady(B);
      point(A);
      const result = remote('switch', B, 'none');
      expect(result.status).toBe(3);
      expect(output(result)).toMatch(/NOT switching/);
      expect(server.current()).toBe(A);
    });

    it('waits for the lock: fails (unchanged) while someone else holds it past the wait', () => {
      server.publishReady(A);
      const holder = spawn('flock', [lockFile(), 'sleep', '8'], { stdio: 'ignore' });
      try {
        spawnSync('sleep', ['0.5']);
        const env = { ...server.env, MERIDIAN_TEST_LOCK_WAIT: '1' };
        const result = runRemote(['switch', A, 'none'], env);
        expect(result.status).toBe(1);
        expect(output(result)).toMatch(/could not acquire .*cowhill-meridian\.lock within 1s/);
        expect(server.current()).toBeNull();
      } finally {
        holder.kill();
      }
    });

    it('waits for the lock: switches only after the holder released it', () => {
      server.publishReady(A);
      const holder = spawn('flock', [lockFile(), 'sleep', '2'], { stdio: 'ignore' });
      spawnSync('sleep', ['0.3']);
      const started = Date.now();
      const env = { ...server.env, MERIDIAN_TEST_LOCK_WAIT: '20' };
      const result = runRemote(['switch', A, 'none'], env);
      holder.kill();
      expect(result.status, output(result)).toBe(0);
      expect(Date.now() - started).toBeGreaterThanOrEqual(1200);
      expect(server.current()).toBe(A);
    });

    it('releases the lock before returning, so the helper reset can take it', () => {
      server.publishReady(A);
      ok('switch', A, 'none');
      ok('reset');
      expect(server.helperCalls()).toEqual([`reset lock=free current=${A}`]);
    });

    it('takes the lock around the switch and nothing else, and never calls the helper itself', () => {
      const script = readFileSync(REMOTE_SCRIPT, 'utf8');
      const body = script.slice(script.indexOf('do_switch() {'), script.indexOf('\ndo_state() {'));
      const lockAt = body.indexOf('flock -w "${LOCK_WAIT}" 9');
      const mvAt = body.indexOf('mv -T -- "${tmp}" "${CURRENT_LINK}"');
      const unlockAt = body.lastIndexOf('flock -u 9');
      expect(body).toContain('exec 9< "${LOCK_FILE}"'); // read-only open, as the contract specifies
      expect(lockAt).toBeGreaterThan(0);
      expect(mvAt).toBeGreaterThan(lockAt);
      expect(unlockAt).toBeGreaterThan(mvAt);
      expect(body).not.toMatch(/run_helper|HELPER|sudo/);
    });
  });

  describe('verify', () => {
    it('passes when current, REVISION, the marker and the service all agree', () => {
      server.publishReady(A);
      ok('switch', A, 'none');
      ok('reset'); // fake helper marks the service active
      expect(ok('verify', A)).toContain(`verify: OK (${A} active)`);
    });

    it('fails on a revision mismatch', () => {
      server.publishReady(A);
      ok('switch', A, 'none');
      ok('reset');
      const result = remote('verify', B);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/current does not point at releases/);
    });

    it('fails when the service is not active', () => {
      server.publishReady(A);
      ok('switch', A, 'none');
      const result = remote('verify', A);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/meridian\.service is not active/);
    });
  });

  describe('prune', () => {
    const releases = () =>
      spawnSync('ls', [join(server.appRoot, 'releases')], { encoding: 'utf8' })
        .stdout.split('\n')
        .filter(Boolean)
        .sort();

    it('keeps current + the previous release, removes older ones and every upload, never touches data/', () => {
      for (const sha of [A, B, C]) server.publishReady(sha);
      writeFileSync(join(server.appRoot, 'data', 'meridian.db'), 'live');
      mkdirSync(join(server.appRoot, 'incoming', fakeSha('left-over')));
      mkdirSync(join(server.appRoot, 'releases', 'not-a-sha'));
      point(C);
      ok('prune', C, B);
      expect(releases()).toEqual([B, C, 'not-a-sha'].sort());
      expect(
        spawnSync('ls', ['-A', join(server.appRoot, 'incoming')], { encoding: 'utf8' }).stdout,
      ).toBe('');
      expect(readFileSync(join(server.appRoot, 'data', 'meridian.db'), 'utf8')).toBe('live');
    });

    it('without a recorded previous release keeps the most recently readied other release', () => {
      const old = server.publishReady(A);
      server.publishReady(B);
      server.publishReady(C);
      const past = Date.now() / 1000 - 3600;
      utimesSync(join(old, '.release-ready'), past, past);
      utimesSync(join(server.appRoot, 'releases', B, '.release-ready'), past + 60, past + 60);
      point(C);
      ok('prune', C, 'none');
      expect(releases()).toEqual([B, C].sort());
    });

    it('refuses to prune when current is not the deployed release', () => {
      server.publishReady(A);
      server.publishReady(B);
      point(A);
      const result = remote('prune', B, A);
      expect(result.status).toBe(1);
      expect(releases()).toEqual([A, B].sort());
    });
  });
});
