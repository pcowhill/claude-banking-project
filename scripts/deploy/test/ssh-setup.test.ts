// ssh-setup.sh / ssh-cleanup.sh: strict, pinned SSH configuration from the
// four Actions settings; secrets via the environment only, never printed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEPLOY_DIR, makeTmp, output, runBash, shellToolsAvailable } from './helpers';

const HOST = '203.0.113.10';

describe.skipIf(!shellToolsAvailable)('ssh-setup.sh', () => {
  let tmp: string;
  let privateKey: string;
  let knownHosts: string;
  beforeEach(() => {
    tmp = makeTmp('ssh');
    const keygen = (file: string, comment: string) =>
      expect(
        spawnSync('ssh-keygen', [
          '-q',
          '-t',
          'ed25519',
          '-N',
          '',
          '-C',
          comment,
          '-f',
          join(tmp, file),
        ]).status,
      ).toBe(0);
    keygen('client', 'test-deploy-key');
    keygen('host', 'test-host-key');
    privateKey = readFileSync(join(tmp, 'client'), 'utf8');
    const hostPub = readFileSync(join(tmp, 'host.pub'), 'utf8').split(' ').slice(0, 2).join(' ');
    knownHosts = `${HOST} ${hostPub}`;
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const setup = (env: Record<string, string | undefined>, dir = join(tmp, 'meridian-ssh')) => {
    const base: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: tmp,
      LIGHTSAIL_HOST: HOST,
      LIGHTSAIL_USER: 'deploy-meridian',
      SSH_PRIVATE_KEY: privateKey,
      SSH_KNOWN_HOSTS: knownHosts,
    };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete base[k];
      else base[k] = v;
    }
    return runBash(join(DEPLOY_DIR, 'ssh-setup.sh'), [dir], base);
  };

  it('writes a 0600 key, the known_hosts exactly, and a strict config; prints no secret', () => {
    const result = setup({});
    expect(result.status, output(result)).toBe(0);
    const dir = join(tmp, 'meridian-ssh');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'id_meridian')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, 'id_meridian'), 'utf8')).toBe(privateKey);
    expect(readFileSync(join(dir, 'known_hosts'), 'utf8')).toBe(`${knownHosts}\n`);
    expect(output(result)).not.toContain('PRIVATE KEY');
    expect(output(result)).not.toContain(privateKey.split('\n')[1]);

    // The effective client configuration, as OpenSSH itself parses it (no connection made).
    const effective = spawnSync('ssh', ['-F', join(dir, 'config'), '-G', 'meridian'], {
      encoding: 'utf8',
    }).stdout;
    expect(effective).toMatch(/^hostname 203\.0\.113\.10$/m);
    expect(effective).toMatch(/^user deploy-meridian$/m);
    expect(effective).toMatch(/^port 22$/m);
    expect(effective).toMatch(/^stricthostkeychecking true$/m);
    expect(effective).toMatch(/^batchmode yes$/m);
    expect(effective).toMatch(/^identitiesonly yes$/m);
    expect(effective).toContain(`userknownhostsfile ${join(dir, 'known_hosts')}`);
    expect(effective).toContain(`identityfile ${join(dir, 'id_meridian')}`);
    expect(effective).toMatch(/^passwordauthentication no$/m);
    expect(effective).toMatch(/^forwardagent no$/m);
  });

  it('reports every missing setting by name without printing values', () => {
    const result = setup({
      LIGHTSAIL_HOST: undefined,
      SSH_PRIVATE_KEY: '',
      SSH_KNOWN_HOSTS: undefined,
    });
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/repository variable LIGHTSAIL_HOST/);
    expect(output(result)).toMatch(/repository secret LIGHTSAIL_SSH_PRIVATE_KEY/);
    expect(output(result)).toMatch(/repository secret LIGHTSAIL_KNOWN_HOSTS/);
    expect(existsSync(join(tmp, 'meridian-ssh'))).toBe(false);
  });

  it('requires the Meridian deployment account', () => {
    const result = setup({ LIGHTSAIL_USER: 'cowhill-infra' });
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/LIGHTSAIL_USER must be deploy-meridian/);
  });

  it('refuses a host value that could inject ssh_config directives', () => {
    const result = setup({ LIGHTSAIL_HOST: `${HOST}\n    ProxyCommand sh -c id` });
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/not a plain host name or IP address/);
  });

  it('refuses known_hosts data without an entry for the host (no TOFU, no keyscan)', () => {
    const result = setup({ SSH_KNOWN_HOSTS: knownHosts.replace(HOST, '198.51.100.7') });
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/contains no host key entry for LIGHTSAIL_HOST/);
  });

  it('refuses a malformed private key without echoing it', () => {
    const result = setup({ SSH_PRIVATE_KEY: 'not-a-key-but-a-secret-value' });
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/not a usable, passphrase-less OpenSSH private key/);
    expect(output(result)).not.toContain('not-a-key-but-a-secret-value');
  });

  it('ssh-cleanup.sh removes the key material', () => {
    expect(setup({}).status).toBe(0);
    const result = runBash(join(DEPLOY_DIR, 'ssh-cleanup.sh'), [join(tmp, 'meridian-ssh')]);
    expect(result.status, output(result)).toBe(0);
    expect(existsSync(join(tmp, 'meridian-ssh'))).toBe(false);
  });
});
