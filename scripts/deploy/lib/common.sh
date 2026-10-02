# shellcheck shell=bash
# Shared helpers for the Meridian deployment scripts that run on the GitHub
# Actions runner (scripts/deploy/*.sh). Sourced, never executed. The
# server-side script (remote/meridian-release.sh) is deliberately
# self-contained and does not use this file.

# Infrastructure contract values (pcowhill/cowhill-infrastructure,
# server/apps/meridian/app.conf, contract version 1). Used by the scripts
# that source this file.
# shellcheck disable=SC2034
readonly MERIDIAN_CUSTOMER_HOST=banking.cowhill.dev
readonly MERIDIAN_OPERATIONS_HOST=banking-ops.cowhill.dev
readonly MERIDIAN_DEPLOY_USER=deploy-meridian
# shellcheck disable=SC2034
readonly MERIDIAN_CUSTOMER_ORIGIN="https://${MERIDIAN_CUSTOMER_HOST}"
# shellcheck disable=SC2034
readonly MERIDIAN_OPERATIONS_ORIGIN="https://${MERIDIAN_OPERATIONS_HOST}"

DEPLOY_SCRIPTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd -- "${DEPLOY_SCRIPTS_DIR}/../.." && pwd)"
REMOTE_SCRIPT="${DEPLOY_SCRIPTS_DIR}/remote/meridian-release.sh"
export DEPLOY_SCRIPTS_DIR REPO_ROOT REMOTE_SCRIPT

log() { printf '[%s] %s\n' "${LOG_TAG:-deploy}" "$*"; }

die() {
  printf '[%s] ERROR: %s\n' "${LOG_TAG:-deploy}" "$*" >&2
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    printf '::error::%s\n' "$*"
  fi
  exit 1
}

require_sha() { # <value>
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "not a full lowercase 40-character commit SHA: '$1'"
}

require_node_22() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "${major}" == "22" ]] || die "Node.js 22 is required (the server runs Node.js 22); found $(node --version)"
}

group_start() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then printf '::group::%s\n' "$*"; else log "== $* =="; fi
}
group_end() { [[ -z "${GITHUB_ACTIONS:-}" ]] || printf '::endgroup::\n'; }
