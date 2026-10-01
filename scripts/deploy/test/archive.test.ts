// Artifact integrity between the package and deploy jobs: a reproducible
// tarball, its SHA-256 checked against the package job's output, and an
// extraction that refuses links and unsafe paths.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

describe.skipIf(!shellToolsAvailable)('archive-release.sh / extract-release.sh', () => {
  let tmp: string;
  let sha: string;
  beforeEach(() => {
    tmp = makeTmp('archive');
    // archive-release.sh stamps entries with the commit time: use a real commit.
    sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    writeRelease(join(tmp, 'release'), sha);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const archive = (outDir: string) =>
    runBash(join(DEPLOY_DIR, 'archive-release.sh'), [join(tmp, 'release'), outDir, sha]);
  const extract = (file: string, hash: string, dest: string) =>
    runBash(join(DEPLOY_DIR, 'extract-release.sh'), [file, hash, dest]);
  const tarball = (dir: string) => join(dir, `meridian-release-${sha}.tar.gz`);
  const hashOf = (dir: string) => readFileSync(`${tarball(dir)}.sha256`, 'utf8').split(' ')[0];

  it('round-trips byte-identically, keeps executable bits, and is reproducible', () => {
    expect(archive(join(tmp, 'a')).status).toBe(0);
    expect(archive(join(tmp, 'b')).status).toBe(0);
    expect(readFileSync(tarball(join(tmp, 'a')))).toEqual(readFileSync(tarball(join(tmp, 'b'))));
    const result = extract(tarball(join(tmp, 'a')), hashOf(join(tmp, 'a')), join(tmp, 'x'));
    expect(result.status, output(result)).toBe(0);
    expect(spawnSync('diff', ['-r', join(tmp, 'release'), join(tmp, 'x')]).status).toBe(0);
    const engine = join(
      tmp,
      'x',
      'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node',
    );
    expect(statSync(engine).mode & 0o111).not.toBe(0);
  });

  it('rejects an archive whose SHA-256 differs from the package job output', () => {
    archive(join(tmp, 'a'));
    const result = extract(tarball(join(tmp, 'a')), 'f'.repeat(64), join(tmp, 'x'));
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/does not match the package job/);
  });

  it('rejects a corrupted archive', () => {
    archive(join(tmp, 'a'));
    const hash = hashOf(join(tmp, 'a'));
    const bytes = readFileSync(tarball(join(tmp, 'a')));
    bytes[bytes.length - 20] ^= 0xff;
    writeFileSync(tarball(join(tmp, 'a')), bytes);
    const result = extract(tarball(join(tmp, 'a')), hash, join(tmp, 'x'));
    expect(result.status).toBe(1);
  });

  it('refuses archives containing symlinks or path traversal', () => {
    const evil = join(tmp, 'evil');
    mkdirSync(join(evil, 'customer'), { recursive: true });
    symlinkSync('/etc/passwd', join(evil, 'customer', 'passwd'));
    const file = join(tmp, 'evil.tar.gz');
    spawnSync('tar', ['-czf', file, '-C', evil, '.']);
    const hash = spawnSync('sha256sum', [file], { encoding: 'utf8' }).stdout.split(' ')[0];
    const result = extract(file, hash, join(tmp, 'x'));
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/non-regular entry/);

    writeFileSync(join(tmp, 'outside.txt'), 'x');
    const traversal = join(tmp, 'traversal.tar.gz');
    spawnSync('tar', [
      '-czf',
      traversal,
      '-C',
      join(tmp, 'release'),
      '--transform',
      's,^,../,',
      'REVISION',
    ]);
    const hash2 = spawnSync('sha256sum', [traversal], { encoding: 'utf8' }).stdout.split(' ')[0];
    const result2 = extract(traversal, hash2, join(tmp, 'y'));
    expect(result2.status).toBe(1);
    expect(output(result2)).toMatch(/unsafe path/);
  });

  it('refuses to archive a release that already carries .release-ready', () => {
    writeFileSync(join(tmp, 'release', '.release-ready'), '');
    const result = archive(join(tmp, 'a'));
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/must not contain \.release-ready/);
  });

  it('only accepts full SHAs', () => {
    expect(
      runBash(join(DEPLOY_DIR, 'archive-release.sh'), [
        join(tmp, 'release'),
        join(tmp, 'a'),
        fakeSha(1).slice(0, 7),
      ]).status,
    ).toBe(1);
  });
});
