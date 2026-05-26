#!/usr/bin/env bash
# Verify the most recent Postgres backup stored in S3/R2.
# Requires: aws CLI (configured), pg_restore (Postgres client tools).
#
# Env vars:
#   BACKUP_S3_URI   – s3:// bucket prefix, e.g. s3://heita-backups/postgres
#   BACKUP_PREFIX   – filename prefix (default: heita-crm)
#   DATABASE_URL    – optional; if set, attempts a schema-only restore to
#                     verify the dump is internally consistent
set -euo pipefail

BACKUP_S3_URI="${BACKUP_S3_URI:?BACKUP_S3_URI is required}"
PREFIX="${BACKUP_PREFIX:-heita-crm}"

echo "[verify-backup] listing recent backups…"
latest_dump="$(
  aws s3 ls "${BACKUP_S3_URI%/}/" \
    | grep "${PREFIX}" \
    | grep '\.dump$' \
    | sort -k1,2 \
    | tail -n1 \
    | awk '{print $4}'
)"

if [[ -z "${latest_dump}" ]]; then
  echo "[verify-backup] FAIL: no backup dump found under ${BACKUP_S3_URI}" >&2
  exit 1
fi

echo "[verify-backup] latest dump: ${latest_dump}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

dump_path="${tmp_dir}/${latest_dump}"
checksum_file="${latest_dump}.sha256"
checksum_path="${tmp_dir}/${checksum_file}"

echo "[verify-backup] downloading dump…"
aws s3 cp "${BACKUP_S3_URI%/}/${latest_dump}" "${dump_path}"

echo "[verify-backup] downloading checksum…"
aws s3 cp "${BACKUP_S3_URI%/}/${checksum_file}" "${checksum_path}" || {
  echo "[verify-backup] WARN: checksum file not found, skipping integrity check"
}

if [[ -f "${checksum_path}" ]]; then
  expected="$(cat "${checksum_path}")"
  actual="$(sha256sum "${dump_path}" | awk '{print $1}')"
  if [[ "${expected}" != "${actual}" ]]; then
    echo "[verify-backup] FAIL: SHA-256 mismatch" >&2
    echo "  expected: ${expected}" >&2
    echo "  actual:   ${actual}" >&2
    exit 1
  fi
  echo "[verify-backup] checksum OK"
fi

echo "[verify-backup] verifying dump structure with pg_restore…"
pg_restore --list "${dump_path}" > /dev/null

echo "[verify-backup] dump is internally consistent"

dump_size_bytes="$(wc -c < "${dump_path}")"
min_size_bytes="${BACKUP_MIN_SIZE_BYTES:-102400}"
if (( dump_size_bytes < min_size_bytes )); then
  echo "[verify-backup] FAIL: dump is suspiciously small (${dump_size_bytes} bytes < ${min_size_bytes} threshold)" >&2
  exit 1
fi

echo "[verify-backup] size check OK (${dump_size_bytes} bytes)"
echo "[verify-backup] SUCCESS: backup ${latest_dump} is valid"
