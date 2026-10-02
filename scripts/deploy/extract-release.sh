#!/usr/bin/env bash
# Verify a downloaded release archive against the SHA-256 the package job
# published as a job output, then extract it into a fresh directory.
#
#   scripts/deploy/extract-release.sh <archive> <expected-sha256> <dest-dir>
#
# The expected hash arrives through a separate channel (a job output), not
# only next to the archive, so a corrupted or swapped artifact is refused.
set -Eeuo pipefail
export LOG_TAG="extract-release"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

[[ $# -eq 3 ]] || die "usage: extract-release.sh <archive> <expected-sha256> <dest-dir>"
archive="$1"
expected="$2"
dest="$3"
[[ "${expected}" =~ ^[0-9a-f]{64}$ ]] || die "expected SHA-256 is malformed: '${expected}'"
[[ -f "${archive}" ]] || die "archive not found: ${archive}"
if [[ -f "${archive}.sha256" ]]; then
  (cd "$(dirname -- "${archive}")" && sha256sum --check --strict --quiet "${archive##*/}.sha256") \
    || die "archive does not match its .sha256 file"
fi
actual="$(sha256sum "${archive}" | cut -d' ' -f1)"
[[ "${actual}" == "${expected}" ]] || die "archive SHA-256 ${actual} does not match the package job's ${expected}"
log "archive SHA-256 verified: ${actual}"

# Refuse absolute paths, '..' components and anything but files/directories
# BEFORE extracting.
while IFS= read -r line; do
  type="${line:0:1}"
  [[ "${type}" == "-" || "${type}" == "d" ]] || die "archive contains a non-regular entry: ${line}"
done < <(tar -tvzf "${archive}")
while IFS= read -r name; do
  [[ "${name}" != /* && "/${name}/" != */../* ]] || die "archive contains an unsafe path: ${name}"
done < <(tar -tzf "${archive}")

[[ ! -e "${dest}" ]] || die "${dest} already exists"
mkdir -p "${dest}"
tar -xzf "${archive}" -C "${dest}" --no-same-owner --delay-directory-restore
log "extracted to ${dest}"
