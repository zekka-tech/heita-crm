#!/usr/bin/env bash
#
# Zero-to-running deploy for the Docker Compose (VPS) setup — Option 1.
# Idempotent: safe to re-run for every release.
#
#   Usage:  ./scripts/deploy.sh [IMAGE_TAG]
#   e.g.    ./scripts/deploy.sh v1.4.2     # pin a tag (recommended)
#           ./scripts/deploy.sh            # uses whatever is in the compose file
#
# Prereqs on the VPS:
#   • docker + compose plugin installed
#   • this repo checked out (for the compose file, Caddyfile, prisma/)
#   • .env.production present and filled in
#   • `docker login ghcr.io` done if the image is private
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
TAG="${1:-}"

if [[ ! -f .env.production ]]; then
  echo "✗ .env.production not found. Copy .env.production.example and fill it in." >&2
  exit 1
fi

# Pin the image tag for this release if one was passed (overrides compose default).
if [[ -n "$TAG" ]]; then
  export HEITA_IMAGE_TAG="$TAG"
  echo "→ Deploying image tag: $TAG"
fi

echo "→ Pulling images…"
$COMPOSE pull

echo "→ Running database migrations (one-shot)…"
$COMPOSE --profile migrate run --rm migrate

echo "→ Starting / updating services…"
$COMPOSE up -d --remove-orphans

echo "→ Waiting for app health…"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health/live | grep -q '"status":"ok"'; then
    echo "✓ App is live."
    break
  fi
  if [[ "$i" == "30" ]]; then
    echo "✗ App did not become healthy in time. Recent logs:" >&2
    $COMPOSE logs --tail=50 app >&2
    exit 1
  fi
  sleep 2
done

echo "→ Pruning dangling images…"
docker image prune -f >/dev/null

echo "✓ Deploy complete."
$COMPOSE ps
