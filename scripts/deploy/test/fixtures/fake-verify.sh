#!/usr/bin/env bash
# TEST FIXTURE — stands in for `node verify-public.mjs` (MERIDIAN_TEST_VERIFY_CMD).
# preflight: fails if $root/fake-verify/fail-preflight exists; if
#   $root/fake-verify/push-main-during-preflight exists, writes its content
#   into the main-SHA file (simulates a newer push while the run is going).
# live --expect-revision <sha>: succeeds only if `current` serves <sha>, the
#   fake service is active, and $root/fake-verify/fail-live-<sha> is absent.
set -Eeuo pipefail
root="${MERIDIAN_TEST_ROOT:?}"
state="${root}/fake-verify"
mkdir -p "${state}"
printf '%s\n' "$*" >> "${state}/calls.log"
case "$1" in
  preflight)
    [[ ! -f "${state}/fail-preflight" ]] || { echo "[verify] banking.cowhill.dev: TLS certificate not trusted" >&2; exit 1; }
    if [[ -f "${state}/push-main-during-preflight" ]]; then
      cp "${state}/push-main-during-preflight" "${MERIDIAN_TEST_MAIN_SHA_FILE:?}"
    fi
    ;;
  live)
    [[ "$2" == "--expect-revision" ]] || exit 64
    sha="$3"
    [[ ! -f "${state}/fail-live-${sha}" ]] || { echo "[verify] FAILED: public /status not ok" >&2; exit 1; }
    [[ -f "${root}/fake-helper/active" ]] || { echo "[verify] FAILED: backend down (502)" >&2; exit 1; }
    [[ "$(cat "${root}/srv/apps/meridian/current/REVISION")" == "${sha}" ]] || { echo "[verify] FAILED: wrong revision" >&2; exit 1; }
    echo "[verify] public verification OK (${sha})"
    ;;
  *) exit 64 ;;
esac
