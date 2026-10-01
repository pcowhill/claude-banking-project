#!/usr/bin/env bash
# Validate a built (or downloaded and extracted) Meridian release directory on
# the runner, with the SAME checks the server applies to the upload before
# publishing it (remote/meridian-release.sh `validate`).
#
#   scripts/deploy/validate-release.sh <release-dir> <full-sha>
set -Eeuo pipefail
export LOG_TAG="validate-release"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

[[ $# -eq 2 ]] || die "usage: validate-release.sh <release-dir> <full-sha>"
release_dir="$1"
sha="$2"
require_sha "${sha}"

bash "${REMOTE_SCRIPT}" validate "${release_dir}" "${sha}"
log "release size: $(du -sh "${release_dir}" | cut -f1), files: $(find "${release_dir}" -type f | wc -l)"
