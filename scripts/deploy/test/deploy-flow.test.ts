// End-to-end deployment flow (deploy-release.sh) against a temporary server
// tree: real rsync over the fake `ssh` (test/fixtures/bin/ssh), the real
// server-side script, a fake service helper that records whether the shared
// lock was held, and a fake public verifier. Covers first deployment, upgrade,
// stale runs, failures before the switch (nothing changes) and after it
// (rollback, failed rollback → stop, first deployment without a rollback
// target), reruns and pruning.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEPLOY_DIR,
  fakeSha,
  makeServer,
  makeTmp,
  output,
  runBash,
  shellToolsAvailable,
  writeRelease,
  type FakeServer,
} from './helpers';

const V1 = fakeSha('v1');
const V2 = fakeSha('v2');
const V3 = fakeSha('v3');

describe.skipIf(!shellToolsAvailable)('deploy-release.sh', () => {
  let server: FakeServer;
  let work: string;
  beforeEach(() => {
    server = makeServer();
    work = makeTmp('runner');
  });
  afterEach(() => {
    server.cleanup();
    rmSync(work, { recursive: true, force: true });
  });

  const deploy = (sha: string, { main = sha }: { main?: string } = {}) => {
    server.setMain(main);
    const release = writeRelease(join(work, `release-${sha.slice(0, 8)}`), sha);
    return runBash(
      join(DEPLOY_DIR, 'deploy-release.sh'),
      ['--sha', sha, '--release', release],
      server.env,
    );
  };
  const deployed = (sha: string) => {
    const result = deploy(sha);
    expect(result.status, output(result)).toBe(0);
    return result;
  };
  const releases = () => readdirSync(join(server.appRoot, 'releases')).sort();
  const resets = () => server.helperCalls().filter((c) => c.startsWith('reset'));

  it('first deployment: upload → publish → locked switch → reset (lock free) → verify → public check', () => {
    const result = deployed(V1);
    expect(server.current()).toBe(V1);
    const release = join(server.appRoot, 'releases', V1);
    expect(existsSync(join(release, '.release-ready'))).toBe(true);
    expect(readFileSync(join(release, 'REVISION'), 'utf8')).toBe(V1);
    // reset ran exactly once, AFTER the switch, with the lock released.
    expect(resets()).toEqual([`reset lock=free current=${V1}`]);
    expect(server.verifyCalls()).toEqual(['preflight', `live --expect-revision ${V1}`]);
    expect(readdirSync(join(server.appRoot, 'incoming'))).toEqual([]);
    expect(output(result)).toMatch(/no rollback target/);
    expect(readFileSync(join(server.root, 'summary.md'), 'utf8')).toContain(`Deployed \`${V1}\``);
  });

  it('only fixed, auditable commands reach the server', () => {
    deployed(V1);
    for (const command of server.sshCommands()) {
      expect(command).toMatch(
        /^(id -un|bash -s -- (preflight \d+|publish [0-9a-f]{40}|rollback-target [0-9a-f]{40}|switch [0-9a-f]{40} ([0-9a-f]{40}|none)|reset|verify [0-9a-f]{40}|prune [0-9a-f]{40} ([0-9a-f]{40}|none))|rsync --server .*\/srv\/apps\/meridian\/incoming\/[0-9a-f]{40}\/)$/,
      );
      expect(command).not.toMatch(/\b(npm|npx|node|prisma|vite|tsc)\b/);
    }
  });

  it('upgrade: keeps the previous release for rollback and prunes older ones', () => {
    deployed(V1);
    deployed(V2);
    expect(server.current()).toBe(V2);
    expect(releases()).toEqual([V1, V2].sort());
    deployed(V3);
    expect(server.current()).toBe(V3);
    expect(releases()).toEqual([V2, V3].sort());
    expect(resets()).toHaveLength(3);
    expect(resets().every((c) => c.includes('lock=free'))).toBe(true);
  });

  it('stale run (target is no longer main): exits 0 before contacting the server', () => {
    const result = deploy(V1, { main: V2 });
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).toMatch(/STALE RUN/);
    expect(server.sshCommands()).toEqual([]);
    expect(server.current()).toBeNull();
  });

  it('stale run detected right before the switch: published but current untouched, nothing reset', () => {
    deployed(V1);
    server.flag('fake-verify/push-main-during-preflight', V3);
    const result = deploy(V2);
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).toMatch(/STALE RUN .*immediately before switching current/);
    expect(server.current()).toBe(V1);
    expect(resets()).toHaveLength(1); // only the first deployment's
    expect(server.sshCommands().some((c) => c.startsWith(`bash -s -- switch ${V2}`))).toBe(false);
  });

  it('fails closed when main cannot be determined', () => {
    server.setMain('garbage');
    const release = writeRelease(join(work, 'r'), V1);
    const result = runBash(
      join(DEPLOY_DIR, 'deploy-release.sh'),
      ['--sha', V1, '--release', release],
      server.env,
    );
    expect(result.status).toBe(1);
    expect(server.sshCommands()).toEqual([]);
  });

  it('failure before the switch (DNS/TLS preflight): nothing uploaded, current and data untouched', () => {
    deployed(V1);
    server.flag('fake-verify/fail-preflight');
    const result = deploy(V2);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/preflight failed; nothing was changed/);
    expect(server.current()).toBe(V1);
    expect(existsSync(join(server.appRoot, 'incoming', V2))).toBe(false);
    expect(resets()).toHaveLength(1);
  });

  it('failure before the switch (SSH unreachable): nothing changes', () => {
    writeFileSync(join(server.root, 'fake-ssh-down'), '');
    const result = deploy(V1);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/SSH connection to the server failed/);
    expect(server.current()).toBeNull();
  });

  it('reset failure after the switch rolls back to the previous release (fresh baseline) and still fails', () => {
    deployed(V1);
    server.flag(`fake-helper/fail-reset-${V2}`);
    const result = deploy(V2);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(new RegExp(`FAILED .* and was ROLLED BACK to ${V1}`));
    expect(server.current()).toBe(V1);
    expect(resets()).toEqual([
      `reset lock=free current=${V1}`,
      `reset lock=free current=${V2}`,
      `reset lock=free current=${V1}`,
    ]);
    expect(server.verifyCalls().at(-1)).toBe(`live --expect-revision ${V1} --attempts 12`);
    // The failed release is not pruned away by a failed run.
    expect(releases()).toEqual([V1, V2].sort());
  });

  it('public verification failure after the switch rolls back as well', () => {
    deployed(V1);
    server.flag(`fake-verify/fail-live-${V2}`);
    const result = deploy(V2);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/public verification failed\) and was ROLLED BACK/);
    expect(server.current()).toBe(V1);
  });

  it('a failed rollback stops the service and fails loudly', () => {
    deployed(V1);
    server.flag('fake-helper/fail-reset');
    const result = deploy(V2);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(
      /CRITICAL: .*rollback .* failed; meridian\.service has been stopped/,
    );
    expect(server.helperCalls().at(-1)).toMatch(/^stop /);
    expect(existsSync(join(server.root, 'fake-helper', 'active'))).toBe(false);
  });

  it('first deployment failing after the switch has no rollback target and fails clearly', () => {
    server.flag(`fake-helper/fail-reset-${V1}`);
    const result = deploy(V1);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/no previous release to roll back to/);
    expect(resets()).toHaveLength(1);
    expect(server.helperCalls().some((c) => c.startsWith('stop'))).toBe(false);
  });

  it('rerun of the same commit reuses the ready release and resets again', () => {
    deployed(V1);
    const marker = join(server.appRoot, 'releases', V1, '.release-ready');
    const before = readFileSync(marker);
    const result = deployed(V1);
    expect(output(result)).toMatch(/already a ready release; reusing it unchanged/);
    expect(readFileSync(marker)).toEqual(before);
    expect(server.current()).toBe(V1);
    expect(resets()).toHaveLength(2);
  });

  it('a rerun after an interrupted upload converges (rsync --delete into incoming/<sha>)', () => {
    writeRelease(join(server.appRoot, 'incoming', V1), V1);
    writeFileSync(join(server.appRoot, 'incoming', V1, 'customer', 'partial.tmp'), 'x');
    deployed(V1);
    expect(existsSync(join(server.appRoot, 'releases', V1, 'customer', 'partial.tmp'))).toBe(false);
  });
});
