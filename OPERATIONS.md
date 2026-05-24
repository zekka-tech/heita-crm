# Heita Operations

## Environments

- `preview`: PR-scoped image tags published by `.github/workflows/preview.yml`
- `staging`: `docker-compose.staging.yml` with pgvector, Redis, MinIO, and Ollama
- `production`: `docker-compose.prod.yml` or your orchestrator using the same image

## Preview rollout

1. Wait for the `Preview image` workflow to publish `ghcr.io/<owner>/heita-crm:pr-<number>`.
2. Copy `.env.example` to `.env.staging` and fill all required secrets.
3. Roll out the preview image:

```bash
HEITA_IMAGE=ghcr.io/<owner>/heita-crm:pr-<number> docker compose -f docker-compose.staging.yml up -d
```

4. Apply migrations:

```bash
docker compose -f docker-compose.staging.yml exec app npx prisma migrate deploy
```

5. Verify:

```bash
curl -fsS http://localhost:3000/api/health?deep=1
```

## Promote to staging or production

1. Pull the image digest from GHCR or use the `main` tag.
2. Apply the same image tag through the target compose file or orchestrator manifest.
3. Run `npx prisma migrate deploy` before shifting traffic.
4. Confirm `/api/health?deep=1`, `/api/metrics`, and a real sign-in flow.

## Rollback

1. Redeploy the last known good image tag.
2. Do not roll back the database unless the migration itself was destructive and has a documented reversal.
3. Confirm health and the latest successful Sentry event before reopening traffic.

## Backups

- Database: daily `pg_dump` plus WAL archiving to object storage
- Object storage: lifecycle policy retaining 30 days of snapshots
- Redis: persistence enabled for operational recovery, not primary retention

## Required secret groups

- Auth: `AUTH_SECRET`, OAuth provider keys
- Messaging: `WHATSAPP_*`, `AT_*`, `VAPID_*`
- AI: `OLLAMA_*`, `ANTHROPIC_API_KEY`
- Storage: `R2_*` or `MINIO_*`
- Observability: `NEXT_PUBLIC_SENTRY_DSN`, `METRICS_BEARER_TOKEN`
- Integrations: `POS_SHARED_SECRET`, `CRON_SECRET`
