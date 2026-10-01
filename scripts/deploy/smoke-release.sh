#!/usr/bin/env bash
# Smoke-test the EXACT packaged release: boot <release>/backend/index.js with
# Node.js 22 and the release's own node_modules, on a throw-away copy of the
# packaged baseline, in the production public-demo posture.
#
#   scripts/deploy/smoke-release.sh <release-dir> <full-sha>
#
# Requires /health 200, /status 200 with status "ok", database.connected true,
# publicDemo true and revision == <sha>, plus an anonymous Engine.IO polling
# handshake; then SIGTERM and a clean exit (status 0). The process gets a
# minimal environment (`env -i`), so nothing from the runner (NODE_OPTIONS,
# NODE_PATH, DATABASE_URL …) can leak in, and the release must stay unmodified
# by the run (the server's systemd unit keeps it read-only).
set -Eeuo pipefail
export LOG_TAG="smoke-release"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

[[ $# -eq 2 ]] || die "usage: smoke-release.sh <release-dir> <full-sha>"
release="$(cd -- "$1" && pwd -P)"
sha="$2"
require_sha "${sha}"
require_node_22
node_bin="$(command -v node)"

# Node must not be able to fall back to a node_modules outside the release.
probe="$(dirname -- "${release}")"
while [[ "${probe}" != "/" ]]; do
  [[ ! -d "${probe}/node_modules" ]] || die "an ancestor of the release contains node_modules (${probe}); the smoke test would not prove the packaged dependencies"
  probe="$(dirname -- "${probe}")"
done

scratch="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "${server_pid}" ]] && kill -0 "${server_pid}" 2> /dev/null; then
    kill -KILL "${server_pid}" 2> /dev/null || true
  fi
  rm -rf -- "${scratch}"
}
trap cleanup EXIT

cp "${release}/baseline/meridian-baseline.db" "${scratch}/meridian.db"
touch "${scratch}/started"
sleep 1 # mtime granularity for the "release unmodified" check below
port="$("${node_bin}" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
log "booting ${release}/backend/index.js on 127.0.0.1:${port} (temporary DB ${scratch}/meridian.db)"

(
  cd "${release}"
  exec env -i \
    PATH="/usr/bin:/bin" \
    HOME="${scratch}" \
    NODE_ENV=production \
    PUBLIC_DEMO=true \
    HOST=127.0.0.1 \
    PORT="${port}" \
    DATABASE_URL="file:${scratch}/meridian.db" \
    CORS_ORIGINS="${MERIDIAN_CUSTOMER_ORIGIN},${MERIDIAN_OPERATIONS_ORIGIN}" \
    OPERATIONS_ORIGINS="${MERIDIAN_OPERATIONS_ORIGIN}" \
    LOG_LEVEL=info \
    "${node_bin}" backend/index.js
) > "${scratch}/server.log" 2>&1 &
server_pid=$!

if ! node "${DEPLOY_SCRIPTS_DIR}/verify-public.mjs" backend --url "http://127.0.0.1:${port}" \
  --expect-revision "${sha}" --attempts 30 --interval 1; then
  log "backend log:"
  cat "${scratch}/server.log" >&2
  die "the packaged backend did not pass the smoke test"
fi

grep -q 'PUBLIC_DEMO=true' "${scratch}/server.log" || die "the backend did not log the public-demo posture"
grep -q "DATABASE_URL=file:${scratch}/meridian.db" "${scratch}/server.log" || die "the backend did not use the temporary database"

log "stopping the backend with SIGTERM"
kill -TERM "${server_pid}"
exit_code=""
for _ in $(seq 1 20); do
  if ! kill -0 "${server_pid}" 2> /dev/null; then
    set +e
    wait "${server_pid}"
    exit_code=$?
    set -e
    break
  fi
  sleep 1
done
server_pid_was="${server_pid}"
server_pid=""
[[ -n "${exit_code}" ]] || { kill -KILL "${server_pid_was}" 2> /dev/null || true; die "the backend did not exit within 20s of SIGTERM"; }
[[ "${exit_code}" -eq 0 ]] || { cat "${scratch}/server.log" >&2; die "the backend exited with status ${exit_code} after SIGTERM"; }
grep -q 'SIGTERM received' "${scratch}/server.log" || die "the backend did not run its SIGTERM shutdown handler"

changed="$(find "${release}" -newer "${scratch}/started" -print -quit)"
[[ -z "${changed}" ]] || die "the running backend modified its release directory: ${changed}"
log "smoke test OK — packaged backend + packaged node_modules served /health, /status and Socket.IO, then shut down cleanly"
