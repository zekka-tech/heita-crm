#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

if [[ -z "${BACKUP_S3_URI:-}" ]]; then
  echo "BACKUP_S3_URI is required." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
prefix="${BACKUP_PREFIX:-heita-crm}"
filename="${prefix}-${timestamp}.dump"
checksum_file="${filename}.sha256"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

dump_path="${tmp_dir}/${filename}"
checksum_path="${tmp_dir}/${checksum_file}"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${dump_path}" \
  "${DATABASE_URL}"

sha256sum "${dump_path}" | awk '{print $1}' > "${checksum_path}"

aws s3 cp "${dump_path}" "${BACKUP_S3_URI%/}/${filename}"
aws s3 cp "${checksum_path}" "${BACKUP_S3_URI%/}/${checksum_file}"

echo "backup.completed ${filename}"
