#!/usr/bin/env bash
# TEST FIXTURE — stands in for `sudo -n /usr/local/sbin/cowhill-meridian-service`.
# Records every call together with whether the shared lock was held at that
# moment, and mimics the helper's observable behaviour (reset takes the lock
# itself and fails if it cannot; status prints ActiveState=…). Failure
# injection: files in $MERIDIAN_TEST_ROOT/fake-helper/ (fail-reset,
# fail-reset-<sha>).
set -Eeuo pipefail
root="${MERIDIAN_TEST_ROOT:?}"
state="${root}/fake-helper"
lock="${root}/run/lock/cowhill-meridian.lock"
mkdir -p "${state}"
if flock -n "${lock}" true; then held=free; else held=HELD; fi
current=""
if [[ -L "${root}/srv/apps/meridian/current" ]]; then
  current="$(readlink -f "${root}/srv/apps/meridian/current")"
  current="${current##*/}"
fi
printf '%s lock=%s current=%s\n' "$1" "${held}" "${current:-none}" >> "${state}/calls.log"
case "$1" in
  status)
    if [[ -f "${state}/active" ]]; then echo "ActiveState=active"; else echo "ActiveState=inactive"; fi
    echo "ConditionResult=yes"
    ;;
  reset)
    # The real helper takes the (non-reentrant) lock itself: if the caller
    # still held it, this would wait 300s and fail.
    exec 9< "${lock}"
    flock -n 9 || { echo "cowhill-meridian-service: could not acquire ${lock} (caller holds it!)" >&2; exit 1; }
    if [[ -f "${state}/fail-reset" || -f "${state}/fail-reset-${current}" ]]; then
      rm -f "${state}/active"
      echo "cowhill-meridian-service: fresh baseline did not become healthy within 90s; meridian.service stopped" >&2
      exit 1
    fi
    touch "${state}/active"
    echo "cowhill-meridian-service: reset: backend healthy (/health 200, /status ok, database connected, publicDemo true)"
    ;;
  stop) rm -f "${state}/active"; echo "meridian.service: inactive" ;;
  restart) touch "${state}/active"; echo "meridian.service: active" ;;
  *) exit 64 ;;
esac
