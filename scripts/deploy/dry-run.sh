#!/usr/bin/env bash
# Local / pull-request dry run of the release pipeline — never contacts a server.
#
#   npm run release:dry-run            (after npm ci; Node.js 22)
#
# Builds the public-demo release for HEAD into a temporary directory, smoke-tests
# the packaged backend with its packaged node_modules, archives it, verifies and
# extracts the archive and validates the result — the same steps the
# package-release job runs (uncommitted changes are allowed here, never in CI).
set -Eeuo pipefail
export LOG_TAG="dry-run"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

sha="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
work="$(mktemp -d "${TMPDIR:-/tmp}/meridian-dry-run.XXXXXX")"
log "working in ${work} (kept for inspection)"
bash "${DEPLOY_SCRIPTS_DIR}/build-release.sh" --sha "${sha}" --out "${work}/release" --allow-dirty
bash "${DEPLOY_SCRIPTS_DIR}/smoke-release.sh" "${work}/release" "${sha}"
bash "${DEPLOY_SCRIPTS_DIR}/archive-release.sh" "${work}/release" "${work}/artifact" "${sha}"
hash="$(cut -d' ' -f1 "${work}/artifact/meridian-release-${sha}.tar.gz.sha256")"
bash "${DEPLOY_SCRIPTS_DIR}/extract-release.sh" "${work}/artifact/meridian-release-${sha}.tar.gz" "${hash}" "${work}/extracted"
bash "${DEPLOY_SCRIPTS_DIR}/validate-release.sh" "${work}/extracted" "${sha}"
log "dry run OK — release ${sha} in ${work}/release, archive in ${work}/artifact"
