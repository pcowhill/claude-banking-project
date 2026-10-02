#!/usr/bin/env bash
# Archive a validated release directory into a reproducible tarball and write
# its SHA-256, for hand-over from the package job to the deploy job.
#
#   scripts/deploy/archive-release.sh <release-dir> <out-dir> <full-sha>
#     → <out-dir>/meridian-release-<sha>.tar.gz and .tar.gz.sha256
#
# Entries are sorted, owned by 0:0 and stamped with the commit time; file modes
# (including the Prisma engine's executable bits) are kept as they are.
set -Eeuo pipefail
export LOG_TAG="archive-release"
# shellcheck source=lib/common.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"

[[ $# -eq 3 ]] || die "usage: archive-release.sh <release-dir> <out-dir> <full-sha>"
release_dir="$1"
out_dir="$2"
sha="$3"
require_sha "${sha}"
[[ -d "${release_dir}" ]] || die "no release directory at ${release_dir}"
[[ ! -e "${release_dir}/.release-ready" ]] || die "the artifact must not contain .release-ready"

mkdir -p "${out_dir}"
archive="${out_dir}/meridian-release-${sha}.tar.gz"
mtime="$(git -C "${REPO_ROOT}" show -s --format=%ct "${sha}")"
tar --create --directory="${release_dir}" --sort=name --owner=0 --group=0 --numeric-owner \
  --mtime="@${mtime}" --format=gnu . | gzip -n -9 > "${archive}"
(cd "${out_dir}" && sha256sum "${archive##*/}" > "${archive##*/}.sha256")
log "archive: ${archive} ($(du -h "${archive}" | cut -f1))"
log "sha256: $(cut -d' ' -f1 "${archive}.sha256")"
