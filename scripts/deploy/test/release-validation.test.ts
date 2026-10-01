// Release validation — the checks applied on the runner after building, after
// downloading the artifact, and on the server to the upload before publishing
// (all three use remote/meridian-release.sh `validate`).
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEPLOY_DIR,
  fakeSha,
  makeTmp,
  output,
  runBash,
  shellToolsAvailable,
  writeRelease,
} from './helpers';

const SHA = fakeSha('validate');
const validate = (dir: string, sha = SHA) =>
  runBash(join(DEPLOY_DIR, 'validate-release.sh'), [dir, sha]);

describe.skipIf(!shellToolsAvailable)('release validation', () => {
  let tmp: string;
  let release: string;
  beforeEach(() => {
    tmp = makeTmp('validate');
    release = writeRelease(join(tmp, 'release'), SHA);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const expectRejected = (pattern: RegExp, sha = SHA) => {
    const result = validate(release, sha);
    expect(result.status, output(result)).not.toBe(0);
    expect(output(result)).toMatch(pattern);
  };

  it('accepts a complete release', () => {
    const result = validate(release);
    expect(result.status, output(result)).toBe(0);
    expect(output(result)).toContain('validate: OK');
  });

  it('rejects a missing customer app', () => {
    rmSync(join(release, 'customer', 'index.html'));
    expectRejected(/customer\/index\.html is missing/);
  });

  it('rejects a missing operations app', () => {
    rmSync(join(release, 'operations'), { recursive: true });
    expectRejected(/operations\/index\.html is missing/);
  });

  it('rejects a missing backend', () => {
    rmSync(join(release, 'backend', 'index.js'));
    expectRejected(/backend\/index\.js is missing/);
  });

  it('rejects unexpected files in backend/', () => {
    writeFileSync(join(release, 'backend', 'index.ts'), 'source');
    expectRejected(/unexpected entry in backend\//);
  });

  it('rejects missing runtime dependencies and the Prisma engine', () => {
    rmSync(join(release, 'node_modules', '.prisma'), { recursive: true });
    expectRejected(/node_modules\/\.prisma\/client is missing/);
  });

  it('rejects a missing node_modules/', () => {
    rmSync(join(release, 'node_modules'), { recursive: true });
    expectRejected(/node_modules\/ is missing/);
  });

  it('rejects .bin tooling and workspace links in node_modules', () => {
    mkdirSync(join(release, 'node_modules', '.bin'));
    expectRejected(/node_modules must not contain node_modules\/\.bin/);
  });

  it('rejects a missing baseline', () => {
    rmSync(join(release, 'baseline', 'meridian-baseline.db'));
    expectRejected(/baseline\/meridian-baseline\.db is missing/);
  });

  it('rejects an empty baseline', () => {
    writeFileSync(join(release, 'baseline', 'meridian-baseline.db'), '');
    expectRejected(/the baseline is empty/);
  });

  it('rejects a baseline that is not SQLite', () => {
    writeFileSync(join(release, 'baseline', 'meridian-baseline.db'), 'not a database at all');
    expectRejected(/SQLite header/);
  });

  it('rejects SQLite sidecars next to the baseline', () => {
    writeFileSync(join(release, 'baseline', 'meridian-baseline.db-journal'), 'x');
    expectRejected(/unexpected entry in baseline\//);
  });

  it('rejects a REVISION for another commit', () => {
    writeFileSync(join(release, 'REVISION'), fakeSha('other'));
    expectRejected(/REVISION does not contain exactly/);
  });

  it('rejects a REVISION with extra bytes (newline)', () => {
    appendFileSync(join(release, 'REVISION'), '\n');
    expectRejected(/REVISION does not contain exactly/);
  });

  it('rejects a target that is not a full lowercase SHA', () => {
    expectRejected(/not a full lowercase 40-character commit SHA/, SHA.toUpperCase());
    expectRejected(/not a full lowercase 40-character commit SHA/, SHA.slice(0, 12));
  });

  it('rejects a symlink anywhere in the release', () => {
    symlinkSync('/etc/passwd', join(release, 'node_modules', 'fastify', 'passwd'));
    expectRejected(/symbolic link in the release: node_modules\/fastify\/passwd/);
  });

  it('rejects a symlink in a static tree (Caddy would follow it)', () => {
    symlinkSync(
      '../../baseline/meridian-baseline.db',
      join(release, 'customer', 'assets', 'db.js'),
    );
    expectRejected(/symbolic link in the release: customer\/assets\/db\.js/);
  });

  it('rejects non-regular entries (FIFO) in a static tree', () => {
    const fifo = join(release, 'operations', 'assets', 'pipe');
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
    expectRejected(/not a regular file or directory: operations\/assets\/pipe/);
  });

  it('rejects dotfiles under the static roots', () => {
    writeFileSync(join(release, 'customer', '.htaccess'), 'x');
    expectRejected(/dotfile under a static root: customer\/\.htaccess/);
  });

  it('rejects .env files anywhere', () => {
    writeFileSync(join(release, 'node_modules', 'fastify', '.env'), 'SECRET=1');
    expectRejected(/secret-like or database file in the release: node_modules\/fastify\/\.env/);
  });

  it('rejects private key material anywhere', () => {
    writeFileSync(
      join(release, 'node_modules', 'bcryptjs', 'notes.txt'),
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n',
    );
    expectRejected(/private key material in the release: node_modules\/bcryptjs\/notes\.txt/);
  });

  it('rejects a stray development database', () => {
    writeFileSync(join(release, 'node_modules', 'fastify', 'dev.db'), 'SQLite format 3');
    expectRejected(/secret-like or database file/);
  });

  it('rejects group/world-writable entries', () => {
    chmodSync(join(release, 'customer', 'index.html'), 0o666);
    expectRejected(/group\/world-writable entry in the release: customer\/index\.html/);
  });

  it('rejects unexpected top-level entries (.git, .release-ready, test output)', () => {
    for (const name of ['.git', '.release-ready', 'test-results']) {
      const path = join(release, name);
      writeFileSync(path, '');
      expectRejected(
        new RegExp(`unexpected top-level entry in the release: ${name.replace('.', '\\.')}`),
      );
      rmSync(path);
    }
  });

  it('rejects a package.json without "type": "module"', () => {
    writeFileSync(join(release, 'package.json'), '{ "name": "x" }');
    expectRejected(/"type": "module"/);
  });
});
