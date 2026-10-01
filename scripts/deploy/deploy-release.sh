#!/usr/bin/env bash
# Deploy a validated Meridian release to the Lightsail server (deploy job only).
#
#   MERIDIAN_SSH_CONFIG=<ssh-dir>/config scripts/deploy/deploy-release.sh --sha <full-sha> --release <dir>
#
# Phase A — nothing on the server changes; any failure simply fails the run:
#   1. stale check (target SHA must still be the tip of main, else exit 0)
#   2. SSH preflight: `id -un` == deploy-meridian, the restricted `status`
#      sudo contract, directories, lock file, free space
#   3. public DNS + trusted TLS for both hostnames
#   4. rsync the release into incoming/<sha>/ (no symlinks followed or sent)
#   5. server-side validation + publication releases/<sha> (.release-ready LAST)
#   6. capture the rollback target (the current ready release, if any)
#   7. stale check again, immediately before the switch
# Phase B — the switch:
#   8. under the shared lock: compare-and-swap `current` → releases/<sha> (mv -T),
#      lock released
# Phase C — after the switch; any failure triggers the rollback:
#   9. `sudo -n cowhill-meridian-service reset` (takes the lock ITSELF; never
#      called while we hold it): pristine baseline, start, local health
#  10. server verification: current, REVISION, ready marker, service active
#  11. public verification (with retries), expecting revision == <sha>
#  12. prune old releases and uploads (only after all of the above passed)
#
# Rollback (Phase C failure with a captured previous release): switch back
# under the lock, release it, `reset` (fresh baseline of the previous release),
# verify; the run still FAILS so the bad release is visible. If the rollback
# fails too, `stop` the service and fail loudly. Without a previous release
# (first deployment) the helper's state is left as is and the run fails.
#
# Everything runs over the pinned `meridian` host of MERIDIAN_SSH_CONFIG. The
# only code executed on the server is remote/meridian-release.sh (streamed via
# `bash -s`) and the root-owned helper through sudo; never npm/build/Prisma.
set -Eeuo pipefail
export LOG_TAG="deploy"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

sha=""
release=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) sha="${2:-}"; shift 2 ;;
    --release) release="${2:-}"; shift 2 ;;
    *) die "usage: deploy-release.sh --sha <full-sha> --release <dir>" ;;
  esac
done
require_sha "${sha}"
[[ -d "${release}" ]] || die "no release directory at '${release}'"
[[ -n "${MERIDIAN_SSH_CONFIG:-}" && -f "${MERIDIAN_SSH_CONFIG}" ]] || die "MERIDIAN_SSH_CONFIG must point at the config written by ssh-setup.sh"

# Test seams (scripts/deploy/test only; the workflows never set them).
if [[ -n "${MERIDIAN_TEST_VERIFY_CMD:-}" ]]; then
  verify_cmd=("${MERIDIAN_TEST_VERIFY_CMD}")
else
  verify_cmd=(node "${DEPLOY_SCRIPTS_DIR}/verify-public.mjs")
fi

summary() { # append a line to the GitHub job summary (if any)
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then printf '%s\n' "$*" >> "${GITHUB_STEP_SUMMARY}"; fi
}
notice() {
  log "$*"
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then printf '::notice::%s\n' "$*"; fi
}

ssh_meridian() { # <timeout-seconds> <remote command…>
  local seconds="$1"
  shift
  timeout --kill-after=15 "${seconds}" ssh -F "${MERIDIAN_SSH_CONFIG}" meridian "$@"
}

# remote <timeout> <action> [args…]: run remote/meridian-release.sh on the server.
# Arguments are only SHAs, "none" or numbers (validated before use).
remote() {
  local seconds="$1"
  shift
  ssh_meridian "${seconds}" "bash -s -- $*" < "${REMOTE_SCRIPT}"
}

current_main_sha() {
  local out attempt
  if [[ -n "${MERIDIAN_TEST_MAIN_SHA_FILE:-}" ]]; then
    tr -d '[:space:]' < "${MERIDIAN_TEST_MAIN_SHA_FILE}"
    return 0
  fi
  for attempt in 1 2 3; do
    if out="$(timeout 60 git -C "${REPO_ROOT}" ls-remote --exit-code origin refs/heads/main)"; then
      printf '%s' "${out%%[[:space:]]*}"
      return 0
    fi
    log "could not read refs/heads/main (attempt ${attempt}/3)"
    sleep $((attempt * 5))
  done
  return 1
}

# is_stale: true (0) when <sha> is no longer the tip of main. Fails closed: if
# main cannot be read, the deployment stops before changing anything.
is_stale() {
  local main
  main="$(current_main_sha)" || die "cannot determine the current refs/heads/main; not deploying"
  [[ "${main}" =~ ^[0-9a-f]{40}$ ]] || die "refs/heads/main resolved to '${main}'; not deploying"
  if [[ "${main}" != "${sha}" ]]; then
    stale_main="${main}"
    return 0
  fi
  return 1
}

stop_as_stale() { # <where>
  notice "STALE RUN — ${sha} is no longer the tip of main (main is now ${stale_main}); skipping the deployment ${1}. The server was not switched. The newer commit's own run deploys it."
  summary "### Meridian deployment skipped (stale)" "" "Target \`${sha}\` is no longer \`main\` (now \`${stale_main}\`). Nothing was switched; the newer run deploys main."
  exit 0
}

stale_main=""
summary "## Meridian deployment" "" "- Target: \`${sha}\`"

# ---------------------------------------------------------------------------
# Phase A — before the switch (no change to current or the live database)
# ---------------------------------------------------------------------------
group_start "Re-validate the release structure"
bash "${DEPLOY_SCRIPTS_DIR}/validate-release.sh" "${release}" "${sha}"
release_kib="$(du -sk "${release}" | cut -f1)"
group_end

if is_stale; then stop_as_stale "before contacting the server"; fi

group_start "SSH preflight"
remote_user="$(ssh_meridian 60 'id -un')" || die "SSH connection to the server failed (host key, key or network)"
[[ "${remote_user}" == "${MERIDIAN_DEPLOY_USER}" ]] || die "connected as '${remote_user}', expected '${MERIDIAN_DEPLOY_USER}'"
log "connected as ${remote_user}"
remote 120 preflight "$((release_kib * 2))" || die "server preflight failed; nothing was changed"
group_end

group_start "Public DNS/TLS preflight"
"${verify_cmd[@]}" preflight || die "public DNS/TLS preflight failed; nothing was changed on the server"
group_end

group_start "Upload to incoming/${sha}/"
# -r -p -t only: no symlinks (--no-links), devices or specials are ever sent;
# modes (including executable bits) are preserved; owner/group are the
# deployment account's. --delete makes a re-upload converge exactly.
timeout --kill-after=15 1800 rsync --recursive --perms --times --no-links --no-devices --no-specials \
  --no-owner --no-group --delete --compress --stats --human-readable \
  -e "ssh -F ${MERIDIAN_SSH_CONFIG}" \
  "${release}/" "meridian:/srv/apps/meridian/incoming/${sha}/" || die "upload failed; nothing was changed"
group_end

group_start "Server-side validation and publication"
remote 900 publish "${sha}" || die "server-side validation/publication failed; current was not changed"
group_end

group_start "Capture the rollback target"
target_out="$(remote 120 rollback-target "${sha}")" || die "could not inspect the current release; nothing was changed"
printf '%s\n' "${target_out}"
current_before="$(sed -n 's/^current=//p' <<< "${target_out}")"
previous="$(sed -n 's/^previous=//p' <<< "${target_out}")"
[[ "${current_before}" == "none" || "${current_before}" =~ ^[0-9a-f]{40}$ ]] || die "unexpected current release '${current_before}'"
[[ "${previous}" == "none" || "${previous}" =~ ^[0-9a-f]{40}$ ]] || die "unexpected rollback target '${previous}'"
log "current before switch: ${current_before}; rollback target: ${previous}"
summary "- Previous release: \`${current_before}\` (rollback target: \`${previous}\`)"
group_end

if is_stale; then stop_as_stale "immediately before switching current"; fi

# ---------------------------------------------------------------------------
# Phase B — the switch (under the shared lock, inside the remote script)
# ---------------------------------------------------------------------------
group_start "Switch current → releases/${sha} (under the shared lock)"
set +e
remote 420 switch "${sha}" "${current_before}"
switch_rc=$?
set -e
group_end
if [[ "${switch_rc}" -ne 0 ]]; then
  # Did the switch happen before the failure (e.g. a dropped connection)?
  state="$(remote 120 state 2> /dev/null || true)"
  if [[ "${state}" != "current=${sha}" || "${current_before}" == "${sha}" ]]; then
    [[ "${switch_rc}" -ne 3 ]] || die "current changed underneath the deployment; not switched, nothing reset"
    die "switching current failed (exit ${switch_rc}); current was not changed, the live database was not reset"
  fi
  log "the switch failed after current already pointed at ${sha}; continuing as a post-switch failure"
fi

# ---------------------------------------------------------------------------
# Phase C — after the switch: reset, verify; roll back on failure
# ---------------------------------------------------------------------------
rollback() { # <reason>
  local reason="$1"
  log "DEPLOYMENT FAILED AFTER THE SWITCH: ${reason}"
  if [[ "${previous}" == "none" ]]; then
    summary "### ❌ Deployment failed after switching current — no previous release to roll back to" "" "${reason}"
    die "deployment of ${sha} failed after switching current (${reason}). There is no previous release to roll back to (first deployment); the service is left in the state the helper produced (a failed reset leaves it stopped). Inspect with: sudo -n /usr/local/sbin/cowhill-meridian-service status, and as an administrator: sudo journalctl -u meridian."
  fi

  group_start "ROLLBACK to releases/${previous}"
  local ok=1
  remote 420 switch "${previous}" "${sha}" || ok=0
  if [[ "${ok}" -eq 1 ]]; then remote 900 reset || ok=0; fi
  if [[ "${ok}" -eq 1 ]]; then remote 120 verify "${previous}" || ok=0; fi
  if [[ "${ok}" -eq 1 ]]; then "${verify_cmd[@]}" live --expect-revision "${previous}" --attempts 12 || ok=0; fi
  group_end

  if [[ "${ok}" -eq 1 ]]; then
    summary "### ❌ Deployment failed and was ROLLED BACK" "" "- Failed: \`${sha}\` — ${reason}" "- Serving again: \`${previous}\` (fresh baseline)"
    die "deployment of ${sha} FAILED (${reason}) and was ROLLED BACK to ${previous}, which is serving again on a fresh baseline. Failing the run so the bad release is visible."
  fi

  log "ROLLBACK FAILED — stopping meridian.service so nothing half-working is served"
  remote 120 stop || log "stopping the service failed as well"
  summary "### 🚨 Deployment failed AND rollback failed — service stopped" "" "- Failed: \`${sha}\` — ${reason}" "- Rollback to \`${previous}\` failed; meridian.service was stopped (both sites answer 502)."
  die "CRITICAL: deployment of ${sha} failed (${reason}) AND the rollback to ${previous} failed; meridian.service has been stopped. Manual attention required: check 'sudo -n /usr/local/sbin/cowhill-meridian-service status' and, as an administrator, 'sudo journalctl -u meridian'."
}

group_start "Reset the demo onto the new release's pristine baseline (lock released)"
remote 900 reset || rollback "the reset helper failed (the backend did not become healthy on the new release)"
group_end

group_start "Verify the deployed revision on the server"
remote 120 verify "${sha}" || rollback "server-side revision verification failed"
group_end

group_start "Public verification"
"${verify_cmd[@]}" live --expect-revision "${sha}" || rollback "public verification failed"
group_end

group_start "Prune old releases"
if ! remote 600 prune "${sha}" "${previous}"; then
  log "pruning failed; the deployment itself succeeded"
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then printf '::warning::%s\n' "Pruning old Meridian releases failed; the deployment itself succeeded. The next deployment retries."; fi
fi
group_end

summary "### ✅ Deployed \`${sha}\`" "" "- https://${MERIDIAN_CUSTOMER_HOST}/ and https://${MERIDIAN_OPERATIONS_HOST}/ serve this revision on a fresh demo baseline."
notice "Meridian ${sha} deployed: https://${MERIDIAN_CUSTOMER_HOST}/ and https://${MERIDIAN_OPERATIONS_HOST}/ (fresh baseline)"
