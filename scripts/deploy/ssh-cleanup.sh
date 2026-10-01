#!/usr/bin/env bash
# Remove the runner's SSH key material (run in an always() step).
#
#   scripts/deploy/ssh-cleanup.sh <ssh-dir>
set -Eeuo pipefail
[[ $# -eq 1 ]] || { echo "usage: ssh-cleanup.sh <ssh-dir>" >&2; exit 64; }
ssh_dir="$1"
if [[ -d "${ssh_dir}" ]]; then
  if [[ -f "${ssh_dir}/id_meridian" ]]; then
    shred -u "${ssh_dir}/id_meridian" 2> /dev/null || rm -f "${ssh_dir}/id_meridian"
  fi
  rm -rf -- "${ssh_dir}"
fi
echo "[ssh-cleanup] SSH files removed from the runner"
