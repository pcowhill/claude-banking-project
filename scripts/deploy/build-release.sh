#!/usr/bin/env bash
# Build the Meridian public-demo release directory on the GitHub Actions runner.
#
#   scripts/deploy/build-release.sh --sha <full-sha> --out <dir> [--allow-dirty]
#
# Everything is built HERE; the Lightsail VM never runs npm, Vite, TypeScript or
# Prisma. Expects `npm ci` to have run (it generates the Prisma client). Steps:
#
#   1. production builds of all workspaces with VITE_PUBLIC_DEMO=true and NO
#      VITE_API_URL / VITE_WS_URL (both SPAs call their own origin);
#   2. the pristine baseline database via `npm run db:baseline -- --out …`, with
#      SEED_NOW pinned to the commit's committer timestamp (reproducible content
#      for the same commit; ids and bcrypt salts stay random by design);
#   3. the release directory:
#        customer/      apps/customer/dist
#        operations/    apps/operations/dist
#        backend/       apps/backend/dist (index.js + index.js.map; @simbank/shared is bundled)
#        node_modules/  the backend's production dependency closure + generated Prisma client
#                       (collect-runtime-deps.mjs)
#        baseline/meridian-baseline.db
#        package.json   {"type":"module"} — explicit ESM semantics for backend/index.js
#        REVISION       the full commit SHA (exactly 40 bytes)
#      (no .release-ready: the server creates it after its own validation);
#   4. modes normalised to u=rwX,go=rX (executable bits that exist are kept);
#   5. the baseline is opened through the release's OWN Prisma client and its
#      core seeded rows checked; the structure is validated.
#
# The output directory must be OUTSIDE the repository so that Node can never
# fall back to the repository's node_modules when the release is smoke-tested.
set -Eeuo pipefail
export LOG_TAG="build-release"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

sha=""
out=""
allow_dirty=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) sha="${2:-}"; shift 2 ;;
    --out) out="${2:-}"; shift 2 ;;
    --allow-dirty) allow_dirty=1; shift ;;
    *) die "usage: build-release.sh --sha <full-sha> --out <dir> [--allow-dirty]" ;;
  esac
done
require_sha "${sha}"
[[ -n "${out}" ]] || die "--out is required"
require_node_22

cd "${REPO_ROOT}"
[[ "$(git rev-parse HEAD)" == "${sha}" ]] || die "the checkout is at $(git rev-parse HEAD), not ${sha}"
if [[ "${allow_dirty}" -eq 0 && -n "$(git status --porcelain --untracked-files=no)" ]]; then
  die "the working tree has uncommitted changes to tracked files; refusing to build a release from it"
fi
[[ -d node_modules/.prisma/client ]] || die "node_modules is not installed (run npm ci first)"

mkdir -p "${out}"
out="$(cd -- "${out}" && pwd -P)"
[[ -z "$(ls -A "${out}")" ]] || die "${out} is not empty"
case "${out}/" in
  "$(pwd -P)"/*) die "--out must be outside the repository (${out})" ;;
esac
probe="$(dirname -- "${out}")"
while [[ "${probe}" != "/" ]]; do
  [[ ! -d "${probe}/node_modules" ]] || die "an ancestor of --out contains node_modules (${probe}); Node could resolve packages from it"
  probe="$(dirname -- "${probe}")"
done

seed_now="$(git show -s --format=%cI "${sha}")"
log "commit ${sha}, SEED_NOW=${seed_now} (committer timestamp)"

# ---------------------------------------------------------------------------
group_start "Production build (VITE_PUBLIC_DEMO=true, same-origin API)"
for app in customer operations; do
  for env_file in .env .env.local .env.production .env.production.local; do
    [[ ! -e "apps/${app}/${env_file}" ]] || die "apps/${app}/${env_file} exists; Vite would read it into the public build"
  done
done
unset VITE_API_URL VITE_WS_URL DATABASE_URL
rm -rf apps/customer/dist apps/operations/dist apps/backend/dist
VITE_PUBLIC_DEMO=true npm run build
for app in customer operations; do
  bundle_hits="$(grep -l 'This is a shared public simulation' "apps/${app}/dist/assets/"*.js || true)"
  [[ -n "${bundle_hits}" ]] || die "the ${app} bundle does not contain the shared-public-demo notice"
  grep -q 'noindex' "apps/${app}/dist/index.html" || die "apps/${app}/dist/index.html lost its robots meta tag"
done
group_end

# ---------------------------------------------------------------------------
group_start "Pristine baseline database"
mkdir -p "${out}/baseline"
SEED_NOW="${seed_now}" npm run db:baseline -- --out "${out}/baseline/meridian-baseline.db"
group_end

# ---------------------------------------------------------------------------
group_start "Assemble the release"
mkdir -p "${out}/customer" "${out}/operations" "${out}/backend"
cp -R apps/customer/dist/. "${out}/customer/"
cp -R apps/operations/dist/. "${out}/operations/"
# Vite copies public/ verbatim, including the repository's empty-directory
# placeholders. They are never needed at runtime (Caddy would 404 them anyway);
# any OTHER dotfile in a static root fails validation below.
find "${out}/customer" "${out}/operations" -type f -name .gitkeep -delete
for f in apps/backend/dist/*; do
  case "${f##*/}" in
    *.js | *.js.map) cp "${f}" "${out}/backend/" ;;
    *) die "unexpected file in apps/backend/dist: ${f##*/}" ;;
  esac
done
node "${DEPLOY_SCRIPTS_DIR}/collect-runtime-deps.mjs" --out "${out}/node_modules"
cat > "${out}/package.json" << 'JSON'
{
  "name": "meridian-release",
  "private": true,
  "description": "Meridian SIMULATED banking public demo — release bundle. Not a real bank; no real money.",
  "type": "module"
}
JSON
printf '%s' "${sha}" > "${out}/REVISION"
chmod -R u=rwX,go=rX "${out}"
group_end

# ---------------------------------------------------------------------------
group_start "Check the baseline through the release's own Prisma client"
node "${DEPLOY_SCRIPTS_DIR}/check-baseline.mjs" --release "${out}" --seed-now "${seed_now}"
group_end

bash "${DEPLOY_SCRIPTS_DIR}/validate-release.sh" "${out}" "${sha}"
log "release built at ${out}"
