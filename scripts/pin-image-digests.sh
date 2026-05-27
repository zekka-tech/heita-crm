#!/usr/bin/env bash
# Pin Docker image tags to their current SHA-256 digests in docker-compose.prod.yml.
# Run this whenever you intentionally upgrade a base image.
# Requires: docker CLI, jq.
#
# Usage:
#   bash scripts/pin-image-digests.sh
set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.prod.yml}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Error: ${COMPOSE_FILE} not found" >&2
  exit 1
fi

for cmd in docker jq; do
  if ! command -v "${cmd}" &>/dev/null; then
    echo "Error: ${cmd} is required but not installed." >&2
    exit 1
  fi
done

pin_image() {
  local tag="$1"
  # Extract image name without any existing digest
  local image_no_digest="${tag%%@*}"

  echo "[pin] Pulling ${image_no_digest}…"
  docker pull --quiet "${image_no_digest}" >/dev/null

  local digest
  digest="$(docker image inspect "${image_no_digest}" --format '{{index .RepoDigests 0}}' 2>/dev/null | awk -F'@' '{print $2}')"

  if [[ -z "${digest}" ]]; then
    echo "[pin] WARN: could not retrieve digest for ${image_no_digest}, skipping" >&2
    return
  fi

  echo "[pin] ${image_no_digest} → ${digest}"

  # Replace the image line in the compose file.
  # Handles both "image: foo:tag" and "image: foo:tag@sha256:..." formats.
  local escaped_image
  escaped_image="$(echo "${image_no_digest}" | sed 's/[/[\.*^$]/\\&/g')"
  sed -i "s|image: ${escaped_image}[^[:space:]]*|image: ${image_no_digest}@${digest}|g" "${COMPOSE_FILE}"
}

# Images to pin — update this list when adding new services
IMAGES=(
  "pgvector/pgvector:pg16"
  "redis:7-alpine"
)

for image in "${IMAGES[@]}"; do
  pin_image "${image}"
done

echo "[pin] Done. Review the changes in ${COMPOSE_FILE} before committing."
