import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A full, lowercase Git commit SHA — the only accepted `REVISION` content. */
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * Read a release `REVISION` file (the full commit SHA the deployment pipeline
 * writes at the release root). Returns `null` for a missing, unreadable or
 * malformed file — never throws. Pure apart from the one read; tested directly.
 */
export function readRevisionFile(path: string): string | null {
  try {
    const value = readFileSync(path, 'utf8').trim();
    return FULL_SHA.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The deployed release's revision, or `null` outside a packaged release.
 *
 * In a release the bundle is `<release>/backend/index.js`, so `../REVISION` is
 * `<release>/REVISION` (Node resolves the entrypoint's real path, so behind the
 * `current` symlink this is the release actually running). In local
 * development (`tsx src/…` or `apps/backend/dist/`) the file does not exist and
 * this is `null`. Read once at start-up; a release is immutable.
 */
export const RELEASE_REVISION: string | null = readRevisionFile(
  fileURLToPath(new URL('../REVISION', import.meta.url)),
);
