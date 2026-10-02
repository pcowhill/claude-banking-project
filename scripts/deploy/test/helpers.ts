// Shared helpers for the deployment tests. Everything runs locally against
// temporary directories: no test ever contacts a real server (the `ssh` on
// PATH is test/fixtures/bin/ssh, the service helper and the public verifier are
// fixtures as well).
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DEPLOY_DIR = resolve(here, '..');
export const REPO_ROOT = resolve(DEPLOY_DIR, '..', '..');
export const REMOTE_SCRIPT = join(DEPLOY_DIR, 'remote', 'meridian-release.sh');
export const FIXTURES = join(here, 'fixtures');

const REQUIRED_TOOLS = [
  'bash',
  'flock',
  'find',
  'rsync',
  'ssh-keygen',
  'tar',
  'gzip',
  'sha256sum',
  'timeout',
];

function haveTool(tool: string): boolean {
  return spawnSync('bash', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
}

/**
 * The shell-based deployment tests need a POSIX userland (bash, util-linux
 * flock, rsync, OpenSSH). They are skipped on Windows / machines without those
 * tools — but CI sets REQUIRE_DEPLOY_TESTS=1, where a missing tool is an error.
 */
export const shellToolsAvailable: boolean = (() => {
  const missing =
    process.platform === 'win32' ? ['(POSIX shell)'] : REQUIRED_TOOLS.filter((t) => !haveTool(t));
  if (missing.length > 0 && process.env.REQUIRE_DEPLOY_TESTS === '1') {
    throw new Error(`deployment tests require: ${missing.join(', ')}`);
  }
  return missing.length === 0;
})();

/** A deterministic full commit SHA for test number `n`. */
export function fakeSha(n: number | string): string {
  return createHash('sha1').update(`meridian-test-${n}`).digest('hex');
}

export function makeTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `meridian-${prefix}-`));
}

function writeFile(path: string, content: string | Buffer, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  chmodSync(path, mode);
}

export const SQLITE_BASELINE = Buffer.concat([
  Buffer.from('SQLite format 3\u0000', 'latin1'),
  Buffer.alloc(4080),
]);

/** A minimal release tree that passes every structural check. */
export function writeRelease(dir: string, sha: string): string {
  const html =
    '<!doctype html><meta name="robots" content="noindex, nofollow"><div id="root"></div>';
  for (const app of ['customer', 'operations']) {
    writeFile(join(dir, app, 'index.html'), html);
    writeFile(
      join(dir, app, 'assets', 'index-abc123.js'),
      'console.log("This is a shared public simulation.")',
    );
    writeFile(join(dir, app, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  }
  writeFile(join(dir, 'backend', 'index.js'), 'import "fastify";\n');
  writeFile(join(dir, 'backend', 'index.js.map'), '{}');
  for (const pkg of ['fastify', 'socket.io', 'bcryptjs', '@prisma/client', '.prisma/client']) {
    writeFile(join(dir, 'node_modules', pkg, 'package.json'), JSON.stringify({ name: pkg }));
  }
  writeFile(join(dir, 'node_modules', '.prisma', 'client', 'schema.prisma'), 'datasource db {}');
  writeFile(
    join(dir, 'node_modules', '.prisma', 'client', 'libquery_engine-debian-openssl-3.0.x.so.node'),
    'ELF',
    0o755,
  );
  writeFile(join(dir, 'baseline', 'meridian-baseline.db'), SQLITE_BASELINE);
  writeFile(
    join(dir, 'package.json'),
    '{ "name": "meridian-release", "private": true, "type": "module" }\n',
  );
  writeFile(join(dir, 'REVISION'), sha);
  return dir;
}

export type Result = SpawnSyncReturns<string>;

export function output(result: Result): string {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/** Run a script file with bash. */
export function runBash(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  input?: string,
): Result {
  return spawnSync('bash', [script, ...args], { env, encoding: 'utf8', input, timeout: 120_000 });
}

/** Run the server-side script exactly as production does: streamed into `bash -s`. */
export function runRemote(args: string[], env: NodeJS.ProcessEnv): Result {
  return spawnSync('bash', ['-s', '--', ...args], {
    env,
    encoding: 'utf8',
    input: readFileSync(REMOTE_SCRIPT, 'utf8'),
    timeout: 120_000,
  });
}

export interface FakeServer {
  root: string;
  appRoot: string;
  env: NodeJS.ProcessEnv;
  mainFile: string;
  setMain(sha: string): void;
  current(): string | null;
  helperCalls(): string[];
  verifyCalls(): string[];
  sshCommands(): string[];
  flag(name: string, content?: string): void;
  publishReady(sha: string): string;
  cleanup(): void;
}

/** A temporary "server": the contract directory tree, the lock file, fake helper/verify/ssh. */
export function makeServer(): FakeServer {
  const root = makeTmp('server');
  const appRoot = join(root, 'srv', 'apps', 'meridian');
  for (const d of ['incoming', 'releases', 'data'])
    mkdirSync(join(appRoot, d), { recursive: true });
  mkdirSync(join(root, 'run', 'lock'), { recursive: true });
  writeFileSync(join(root, 'run', 'lock', 'cowhill-meridian.lock'), '');
  const mainFile = join(root, 'main-sha');
  writeFileSync(join(root, 'ssh-config'), '# test\n');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${join(FIXTURES, 'bin')}:${process.env.PATH}`,
    MERIDIAN_TEST_ROOT: root,
    MERIDIAN_TEST_HELPER: join(FIXTURES, 'fake-helper.sh'),
    MERIDIAN_TEST_VERIFY_CMD: join(FIXTURES, 'fake-verify.sh'),
    MERIDIAN_TEST_MAIN_SHA_FILE: mainFile,
    MERIDIAN_TEST_LOCK_WAIT: '5',
    MERIDIAN_SSH_CONFIG: join(root, 'ssh-config'),
    GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
  };
  delete env.GITHUB_ACTIONS;
  const lines = (file: string): string[] =>
    existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  const server: FakeServer = {
    root,
    appRoot,
    env,
    mainFile,
    setMain: (sha) => writeFileSync(mainFile, `${sha}\n`),
    current: () => {
      const link = join(appRoot, 'current');
      try {
        return readlinkSync(link).split('/').pop() ?? null;
      } catch {
        return null;
      }
    },
    helperCalls: () => lines(join(root, 'fake-helper', 'calls.log')),
    verifyCalls: () => lines(join(root, 'fake-verify', 'calls.log')),
    sshCommands: () => lines(join(root, 'fake-ssh.log')),
    flag: (name, content = '') => {
      const [dir, file] = name.split('/');
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, file), content);
    },
    /** Upload + publish a release for `sha` through the real server-side script. */
    publishReady: (sha) => {
      writeRelease(join(appRoot, 'incoming', sha), sha);
      const result = runRemote(['publish', sha], env);
      if (result.status !== 0) throw new Error(`publish failed: ${output(result)}`);
      return join(appRoot, 'releases', sha);
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
  return server;
}
