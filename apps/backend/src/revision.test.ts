import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RELEASE_REVISION, readRevisionFile } from './revision';

/**
 * The release `REVISION` file is written by the deployment pipeline
 * (scripts/deploy/build-release.sh) and surfaced on GET /status so the
 * pipeline can prove the public site serves the release it just shipped.
 */
describe('release revision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meridian-revision-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, content: string): string => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };

  it('accepts exactly one full lowercase commit SHA (trailing newline allowed)', () => {
    const sha = 'a'.repeat(40);
    expect(readRevisionFile(write('ok', `${sha}\n`))).toBe(sha);
  });

  it('rejects malformed content and missing files without throwing', () => {
    expect(readRevisionFile(write('short', 'abc123'))).toBeNull();
    expect(readRevisionFile(write('upper', 'A'.repeat(40)))).toBeNull();
    expect(readRevisionFile(write('two', `${'a'.repeat(40)}\n${'b'.repeat(40)}`))).toBeNull();
    expect(readRevisionFile(write('empty', ''))).toBeNull();
    expect(readRevisionFile(join(dir, 'missing'))).toBeNull();
  });

  it('is null in local development (no REVISION next to the source tree)', () => {
    expect(RELEASE_REVISION).toBeNull();
  });
});
