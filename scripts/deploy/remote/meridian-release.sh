#!/usr/bin/env bash
#
# meridian-release.sh — the ONLY code the Meridian deployment runs on the server.
#
# It is never installed on the server. The deploy job streams this exact file
# (from the commit being deployed) over the pinned SSH connection:
#
#   ssh meridian 'bash -s -- <action> [args]' < scripts/deploy/remote/meridian-release.sh
#
# and it runs as deploy-meridian. Every path below is a fixed value from the
# infrastructure contract (pcowhill/cowhill-infrastructure,
# server/apps/meridian/app.conf, contract version 1). Arguments are only ever a
# full commit SHA (validated: 40 lowercase hex) or the word "none"; nothing from
# the release itself is executed, sourced or parsed as configuration.
#
# Actions:
#   preflight [required-kib]      identity, directories, lock, `status`, free space
#   validate <dir> <sha>          structural release checks (also used on the runner)
#   publish <sha>                 incoming/<sha> → releases/<sha>, chmod, .release-ready LAST
#   rollback-target <sha>         print current=<sha|none> and previous=<sha|none> (a valid rollback target)
#   switch <sha> <expected>       under the shared lock: compare-and-swap `current` (mv -T)
#   reset                         sudo -n <helper> reset   (NEVER while holding the lock)
#   stop                          sudo -n <helper> stop
#   verify <sha>                  current → releases/<sha>, REVISION, ready marker, `status`
#   state                         print the current release (or none)
#   prune <sha> <previous|none>   keep current + one previous ready release; clear incoming/
#
# Test hooks (ONLY for scripts/deploy/test, which run this file locally against
# a temporary directory tree; refused when running as the real deploy account):
#   MERIDIAN_TEST_ROOT    prefix for every contract path
#   MERIDIAN_TEST_HELPER  executable standing in for `sudo -n <helper>`
#   MERIDIAN_TEST_LOCK_WAIT  shorter lock wait (seconds)
#
# Exit codes: 0 ok; 1 failure; 64 usage. `switch` exits 3 when `current` no
# longer holds the expected value (nothing was changed).

set -Eeuo pipefail

main() {
  PATH=/usr/sbin:/usr/bin:/sbin:/bin
  export PATH
  export LC_ALL=C
  umask 022

  local test_root="${MERIDIAN_TEST_ROOT:-}"
  readonly DEPLOY_USER=deploy-meridian
  readonly HELPER_PATH=/usr/local/sbin/cowhill-meridian-service
  LOCK_WAIT=300

  if [[ -n "${test_root}" ]]; then
    [[ "$(id -un)" != "${DEPLOY_USER}" ]] || die "MERIDIAN_TEST_ROOT is set while running as ${DEPLOY_USER}; refusing"
    [[ "${test_root}" == /* && -d "${test_root}" ]] || die "MERIDIAN_TEST_ROOT must be an existing absolute directory"
    [[ -n "${MERIDIAN_TEST_HELPER:-}" && -x "${MERIDIAN_TEST_HELPER}" ]] || die "MERIDIAN_TEST_HELPER must be an executable"
    HELPER=("${MERIDIAN_TEST_HELPER}")
    EXPECTED_USER="$(id -un)"
    LOCK_WAIT="${MERIDIAN_TEST_LOCK_WAIT:-${LOCK_WAIT}}"
  else
    HELPER=(sudo -n "${HELPER_PATH}")
    EXPECTED_USER="${DEPLOY_USER}"
  fi
  readonly APP_ROOT="${test_root}/srv/apps/meridian"
  readonly INCOMING_DIR="${APP_ROOT}/incoming"
  readonly RELEASES_DIR="${APP_ROOT}/releases"
  readonly CURRENT_LINK="${APP_ROOT}/current"
  readonly DATA_DIR="${APP_ROOT}/data"
  readonly LOCK_FILE="${test_root}/run/lock/cowhill-meridian.lock"

  [[ $# -ge 1 ]] || usage
  local action="$1"
  shift
  case "${action}" in
    preflight) [[ $# -le 1 ]] || usage; do_preflight "${1:-0}" ;;
    validate) [[ $# -eq 2 ]] || usage; validate_release "$1" "$2"; log "validate: OK ($1)" ;;
    publish) [[ $# -eq 1 ]] || usage; do_publish "$1" ;;
    rollback-target) [[ $# -eq 1 ]] || usage; do_rollback_target "$1" ;;
    switch) [[ $# -eq 2 ]] || usage; do_switch "$1" "$2" ;;
    reset) [[ $# -eq 0 ]] || usage; run_helper reset ;;
    stop) [[ $# -eq 0 ]] || usage; run_helper stop ;;
    verify) [[ $# -eq 1 ]] || usage; do_verify "$1" ;;
    state) [[ $# -eq 0 ]] || usage; do_state ;;
    prune) [[ $# -eq 2 ]] || usage; do_prune "$1" "$2" ;;
    *) usage ;;
  esac
}

usage() {
  printf 'usage: meridian-release.sh preflight|validate|publish|rollback-target|switch|reset|stop|verify|state|prune ...\n' >&2
  exit 64
}

log() { printf 'meridian-release: %s\n' "$*"; }

die() {
  printf 'meridian-release: ERROR: %s\n' "$*" >&2
  exit 1
}

require_sha() { # <value> — a full, lowercase commit SHA and nothing else
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "not a full lowercase 40-character commit SHA: '$1'"
}

run_helper() { # <restart|stop|status|reset>
  log "running: ${HELPER[*]} $1"
  "${HELPER[@]}" "$1"
}

# ---------------------------------------------------------------------------
# Release structure
# ---------------------------------------------------------------------------

# validate_release <dir> <sha>: every structural requirement of a release as it
# is uploaded (before .release-ready exists). Read-only.
validate_release() {
  local dir="$1" sha="$2" entry bad header
  require_sha "${sha}"
  [[ -d "${dir}" && ! -L "${dir}" ]] || die "release directory missing or a symlink: ${dir}"

  # Exactly the expected top-level entries; anything else (.git, .env, test
  # output, caches, a stray .release-ready) is refused.
  while IFS= read -r -d '' entry; do
    case "${entry##*/}" in
      customer | operations | backend | node_modules | baseline | package.json | REVISION) ;;
      *) die "unexpected top-level entry in the release: ${entry##*/}" ;;
    esac
  done < <(find "${dir}" -mindepth 1 -maxdepth 1 -print0)

  # REVISION: exactly the 40 SHA characters, no newline, nothing else.
  [[ -f "${dir}/REVISION" && ! -L "${dir}/REVISION" ]] || die "REVISION is missing"
  [[ "$(wc -c < "${dir}/REVISION")" -eq 40 && "$(cat "${dir}/REVISION")" == "${sha}" ]] \
    || die "REVISION does not contain exactly ${sha}"

  [[ -f "${dir}/package.json" ]] || die "package.json is missing"
  grep -Eq '"type"[[:space:]]*:[[:space:]]*"module"' "${dir}/package.json" || die 'package.json does not declare "type": "module"'

  [[ -f "${dir}/customer/index.html" ]] || die "customer/index.html is missing (customer app)"
  [[ -f "${dir}/operations/index.html" ]] || die "operations/index.html is missing (operations app)"
  [[ -f "${dir}/backend/index.js" ]] || die "backend/index.js is missing (backend)"
  bad="$(find "${dir}/backend" -mindepth 1 \( -type d -o \( ! -name '*.js' ! -name '*.js.map' \) \) -print -quit)"
  [[ -z "${bad}" ]] || die "unexpected entry in backend/: ${bad#"${dir}/"}"

  [[ -d "${dir}/node_modules" ]] || die "node_modules/ is missing"
  for entry in fastify socket.io bcryptjs @prisma/client .prisma/client; do
    [[ -f "${dir}/node_modules/${entry}/package.json" ]] || die "node_modules/${entry} is missing"
  done
  compgen -G "${dir}/node_modules/.prisma/client/libquery_engine-*.so.node" > /dev/null \
    || die "the Prisma query engine library is missing from node_modules/.prisma/client"
  [[ -f "${dir}/node_modules/.prisma/client/schema.prisma" ]] || die "node_modules/.prisma/client/schema.prisma is missing"
  bad="$(find "${dir}/node_modules" \( -name .bin -o -name 'playwright*' -o -name ms-playwright -o -name '@simbank' \) -print -quit)"
  [[ -z "${bad}" ]] || die "node_modules must not contain ${bad#"${dir}/"}"

  # Baseline: the only file in baseline/, a non-empty regular SQLite file.
  local baseline="${dir}/baseline/meridian-baseline.db"
  [[ -e "${baseline}" ]] || die "baseline/meridian-baseline.db is missing"
  [[ -f "${baseline}" && ! -L "${baseline}" ]] || die "the baseline is not a regular file"
  [[ -s "${baseline}" ]] || die "the baseline is empty"
  header="$(head -c 15 "${baseline}")"
  [[ "${header}" == "SQLite format 3" ]] || die "the baseline does not start with the SQLite header"
  bad="$(find "${dir}/baseline" -mindepth 1 ! -path "${baseline}" -print -quit)"
  [[ -z "${bad}" ]] || die "unexpected entry in baseline/ (SQLite sidecar?): ${bad#"${dir}/"}"

  # Whole tree: only regular files and directories (no symlinks, sockets,
  # FIFOs or devices), nothing group/world-writable, no setuid/setgid bits.
  bad="$(find "${dir}" -type l -print -quit)"
  [[ -z "${bad}" ]] || die "symbolic link in the release: ${bad#"${dir}/"}"
  bad="$(find "${dir}" ! -type f ! -type d -print -quit)"
  [[ -z "${bad}" ]] || die "not a regular file or directory: ${bad#"${dir}/"}"
  bad="$(find "${dir}" -perm /022 -print -quit)"
  [[ -z "${bad}" ]] || die "group/world-writable entry in the release: ${bad#"${dir}/"}"
  bad="$(find "${dir}" -perm /6000 -print -quit)"
  [[ -z "${bad}" ]] || die "setuid/setgid entry in the release: ${bad#"${dir}/"}"

  # Static roots (served by Caddy): no dotfiles at all (none are needed).
  bad="$(find "${dir}/customer" "${dir}/operations" -mindepth 1 -name '.*' -print -quit)"
  [[ -z "${bad}" ]] || die "dotfile under a static root: ${bad#"${dir}/"}"

  # No secrets or stray databases anywhere: .env files, private keys, SSH
  # identities, npm credentials, other SQLite files (e.g. a development dev.db).
  bad="$(find "${dir}" -type f \( -name '.env' -o -name '.env.*' -o -name '.npmrc' -o -name 'id_rsa*' \
    -o -name 'id_ed25519*' -o -name 'id_ecdsa*' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' \
    -o -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' -o -name '*.db-journal' \) \
    ! -path "${baseline}" -print -quit)"
  [[ -z "${bad}" ]] || die "secret-like or database file in the release: ${bad#"${dir}/"}"
  bad="$(grep -rlIE -m1 -- '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----' "${dir}" | head -n 1 || true)"
  [[ -z "${bad}" ]] || die "private key material in the release: ${bad#"${dir}/"}"
}

# is_ready_release <dir> <sha>: published, marked ready, REVISION matches.
is_ready_release() {
  local dir="$1" sha="$2"
  [[ -d "${dir}" && ! -L "${dir}" && -f "${dir}/.release-ready" && -f "${dir}/REVISION" ]] || return 1
  [[ "$(cat "${dir}/REVISION")" == "${sha}" ]]
}

# current_release_name: the SHA `current` points at, or "none". Fails when
# `current` exists but is not a symlink into the releases directory.
current_release_name() {
  local target releases_real
  if [[ ! -e "${CURRENT_LINK}" && ! -L "${CURRENT_LINK}" ]]; then
    printf 'none'
    return 0
  fi
  [[ -L "${CURRENT_LINK}" ]] || die "${CURRENT_LINK} exists but is not a symlink; refusing"
  target="$(readlink -f -- "${CURRENT_LINK}" || true)"
  releases_real="$(readlink -f -- "${RELEASES_DIR}")"
  [[ -n "${target}" && -d "${target}" && "${target%/*}" == "${releases_real}" ]] \
    || die "${CURRENT_LINK} does not resolve to a directory directly under ${RELEASES_DIR} (${target:-dangling})"
  printf '%s' "${target##*/}"
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

do_preflight() {
  local required_kib="$1" user status_out available_kib current
  [[ "${required_kib}" =~ ^[0-9]+$ ]] || die "required space must be a number of KiB"
  user="$(id -un)"
  log "user=${user}"
  [[ "${user}" == "${EXPECTED_USER}" ]] || die "connected as '${user}', expected '${EXPECTED_USER}'"
  for d in "${APP_ROOT}" "${INCOMING_DIR}" "${RELEASES_DIR}"; do
    [[ -d "${d}" && ! -L "${d}" && -w "${d}" ]] || die "${d} is missing or not writable by ${user}"
  done
  [[ -d "${DATA_DIR}" ]] || die "${DATA_DIR} is missing (infrastructure not applied?)"
  [[ -f "${LOCK_FILE}" && ! -L "${LOCK_FILE}" && -r "${LOCK_FILE}" ]] || die "${LOCK_FILE} is missing or unreadable"
  # The release ships the Prisma query engine built on the runner for
  # linux-x86_64 with OpenSSL 3 (libquery_engine-debian-openssl-3.0.x); make
  # sure the server can load it before anything is switched.
  [[ "$(uname -m)" == "x86_64" ]] || die "server architecture is $(uname -m); the release's Prisma engine is linux-x86_64"
  compgen -G "/usr/lib/x86_64-linux-gnu/libssl.so.3*" > /dev/null || compgen -G "/lib/x86_64-linux-gnu/libssl.so.3*" > /dev/null \
    || die "OpenSSL 3 (libssl.so.3) not found; the release's Prisma engine needs it"
  log "platform=linux-x86_64 openssl=3"
  # The restricted sudo contract must work before anything is uploaded. Before
  # the first deployment the unit is inactive (ConditionResult=no): expected.
  status_out="$(run_helper status)" || die "the service helper 'status' failed (sudoers contract broken?)"
  printf '%s\n' "${status_out}"
  grep -q '^ActiveState=' <<< "${status_out}" || die "unexpected 'status' output from the service helper"
  current="$(current_release_name)"
  log "current=${current}"
  available_kib="$(df -Pk "${APP_ROOT}" | awk 'NR == 2 { print $4 }')"
  log "free_kib=${available_kib} required_kib=${required_kib}"
  [[ "${available_kib}" -ge "${required_kib}" ]] || die "not enough free space under ${APP_ROOT}: ${available_kib} KiB < ${required_kib} KiB"
  log "preflight: OK"
}

do_publish() {
  local sha="$1" src dest current
  require_sha "${sha}"
  src="${INCOMING_DIR}/${sha}"
  dest="${RELEASES_DIR}/${sha}"
  current="$(current_release_name)"

  if [[ -e "${dest}" || -L "${dest}" ]]; then
    if is_ready_release "${dest}" "${sha}"; then
      # Immutable once ready: never overwritten, simply reused.
      log "publish: releases/${sha} is already a ready release; reusing it unchanged"
      rm -rf -- "${src:?}"
      printf 'published=reused\n'
      return 0
    fi
    [[ "${current}" != "${sha}" ]] || die "releases/${sha} is the CURRENT release but is not ready; refusing to touch it"
    log "publish: removing incomplete releases/${sha} left by an earlier run (not current)"
    rm -rf -- "${dest:?}"
  fi

  [[ -d "${src}" ]] || die "nothing uploaded at ${src}"
  validate_release "${src}" "${sha}"
  [[ ! -e "${src}/.release-ready" ]] || die "the upload must not contain .release-ready"
  mv -T -- "${src}" "${dest}"
  chmod -R u=rwX,go=rX -- "${dest}"
  validate_release "${dest}" "${sha}"
  sync -f "${dest}/REVISION" 2> /dev/null || sync
  # LAST: the marker means every part of the release is complete.
  : > "${dest}/.release-ready"
  chmod 0644 "${dest}/.release-ready"
  log "publish: releases/${sha} is ready"
  printf 'published=new\n'
}

do_rollback_target() {
  local sha="$1" current dir
  require_sha "${sha}"
  current="$(current_release_name)"
  printf 'current=%s\n' "${current}"
  if [[ "${current}" == "none" ]]; then
    log "rollback-target: no current release (first deployment); no rollback target"
    printf 'previous=none\n'
    return 0
  fi
  dir="${RELEASES_DIR}/${current}"
  if [[ "${current}" == "${sha}" ]]; then
    log "rollback-target: current already is ${sha} (redeploy); no rollback target"
    printf 'previous=none\n'
  elif [[ ! "${current}" =~ ^[0-9a-f]{40}$ ]]; then
    log "rollback-target: current release name '${current}' is not a commit SHA; not a rollback target"
    printf 'previous=none\n'
  elif ! is_ready_release "${dir}" "${current}"; then
    log "rollback-target: current release ${current} is not ready or its REVISION does not match; not a rollback target"
    printf 'previous=none\n'
  else
    log "rollback-target: ${current}"
    printf 'previous=%s\n' "${current}"
  fi
}

# do_switch <sha> <expected-current|none>: atomically point `current` at
# releases/<sha>, holding the shared lock ONLY for the switch itself.
do_switch() {
  local sha="$1" expected="$2" dest now tmp
  require_sha "${sha}"
  [[ "${expected}" == "none" ]] || require_sha "${expected}"
  dest="${RELEASES_DIR}/${sha}"
  is_ready_release "${dest}" "${sha}" || die "releases/${sha} is not a ready release; refusing to switch"
  [[ -f "${LOCK_FILE}" && ! -L "${LOCK_FILE}" ]] || die "${LOCK_FILE} is missing or not a regular file"

  # Read-only open, exactly as the infrastructure contract specifies.
  exec 9< "${LOCK_FILE}"
  flock -w "${LOCK_WAIT}" 9 || die "could not acquire ${LOCK_FILE} within ${LOCK_WAIT}s"
  log "switch: lock acquired"

  # Re-checks while holding the lock.
  if ! is_ready_release "${dest}" "${sha}"; then
    flock -u 9
    exec 9<&-
    die "releases/${sha} stopped being ready; not switching"
  fi
  now="$(current_release_name)"
  if [[ "${now}" != "${expected}" ]]; then
    flock -u 9
    exec 9<&-
    log "switch: current is '${now}', expected '${expected}' — changed by someone else; NOT switching"
    exit 3
  fi

  tmp="${APP_ROOT}/.current.tmp.${sha:0:12}.$$"
  rm -f -- "${tmp}"
  ln -s -- "${dest}" "${tmp}"
  mv -T -- "${tmp}" "${CURRENT_LINK}"
  [[ "$(current_release_name)" == "${sha}" ]] || {
    flock -u 9
    exec 9<&-
    die "current does not point at releases/${sha} after the switch"
  }
  log "switch: current -> releases/${sha} (was ${expected})"

  flock -u 9
  exec 9<&-
  log "switch: lock released"
}

do_state() {
  local current
  current="$(current_release_name)"
  printf 'current=%s\n' "${current}"
}

do_verify() {
  local sha="$1" target revision status_out
  require_sha "${sha}"
  target="$(readlink -f -- "${CURRENT_LINK}" || true)"
  log "readlink -f current: ${target:-<none>}"
  [[ "${target}" == "$(readlink -f -- "${RELEASES_DIR}")/${sha}" ]] || die "current does not point at releases/${sha}"
  revision="$(cat "${CURRENT_LINK}/REVISION")"
  log "current/REVISION: ${revision}"
  [[ "${revision}" == "${sha}" ]] || die "current/REVISION is '${revision}', expected '${sha}'"
  [[ -f "${CURRENT_LINK}/.release-ready" ]] || die "current release is not marked ready"
  status_out="$(run_helper status)" || die "the service helper 'status' failed"
  printf '%s\n' "${status_out}"
  grep -qx 'ActiveState=active' <<< "${status_out}" || die "meridian.service is not active"
  log "verify: OK (${sha} active)"
}

do_prune() {
  local sha="$1" previous="$2" current keep_prev="" name path newest="" newest_time=0 t
  require_sha "${sha}"
  [[ "${previous}" == "none" ]] || require_sha "${previous}"
  current="$(current_release_name)"
  [[ "${current}" == "${sha}" ]] || die "current is '${current}', not ${sha}; refusing to prune"

  if [[ "${previous}" != "none" && "${previous}" != "${current}" ]] && is_ready_release "${RELEASES_DIR}/${previous}" "${previous}"; then
    keep_prev="${previous}"
  else
    # No usable rollback target recorded (first deployment or a redeploy):
    # keep the most recently readied other release instead, if any.
    for path in "${RELEASES_DIR}"/*; do
      name="${path##*/}"
      [[ "${name}" =~ ^[0-9a-f]{40}$ && "${name}" != "${current}" ]] || continue
      is_ready_release "${path}" "${name}" || continue
      t="$(stat -c %Y "${path}/.release-ready")"
      if (( t > newest_time )); then
        newest_time="${t}"
        newest="${name}"
      fi
    done
    keep_prev="${newest}"
  fi
  log "prune: keeping current ${current}${keep_prev:+ and previous ${keep_prev}}"

  for path in "${RELEASES_DIR}"/* "${RELEASES_DIR}"/.[!.]*; do
    [[ -e "${path}" || -L "${path}" ]] || continue
    name="${path##*/}"
    if [[ ! "${name}" =~ ^[0-9a-f]{40}$ ]]; then
      log "prune: leaving unexpected entry releases/${name} alone"
      continue
    fi
    [[ "${name}" == "${current}" || "${name}" == "${keep_prev}" ]] && continue
    # Re-read current right before each removal: never remove what it points at.
    [[ "$(current_release_name)" != "${name}" ]] || continue
    log "prune: removing releases/${name}"
    rm -rf -- "${RELEASES_DIR:?}/${name}"
  done

  for path in "${INCOMING_DIR}"/* "${INCOMING_DIR}"/.[!.]*; do
    [[ -e "${path}" || -L "${path}" ]] || continue
    name="${path##*/}"
    if [[ "${name}" =~ ^[0-9a-f]{40}$ ]]; then
      log "prune: removing incoming/${name}"
      rm -rf -- "${INCOMING_DIR:?}/${name}"
    else
      log "prune: leaving unexpected entry incoming/${name} alone"
    fi
  done

  for path in "${APP_ROOT}"/.current.tmp.*; do
    [[ -L "${path}" ]] || continue
    log "prune: removing stale temporary link ${path##*/}"
    rm -f -- "${path}"
  done
  df -Pk "${APP_ROOT}" | awk 'NR == 2 { printf "meridian-release: prune: free_kib=%s\n", $4 }'
  log "prune: OK"
}

# Wrapped in main and fed /dev/null: bash reads this whole file from stdin
# before running anything, and no command can swallow the rest of the script.
main "$@" < /dev/null
