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

### Automated backup flow

- GitHub Actions workflow: `.github/workflows/backup.yml`
- Backup script: `scripts/backup-postgres.sh`
- Required secrets:
  - `BACKUP_DATABASE_URL`
  - `BACKUP_S3_URI`
  - `BACKUP_AWS_ACCESS_KEY_ID`
  - `BACKUP_AWS_SECRET_ACCESS_KEY`
  - `BACKUP_AWS_REGION`
- Output format: compressed PostgreSQL custom dump plus a sibling SHA-256 file
- Restore command:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "$DATABASE_URL" \
  ./heita-crm-<timestamp>.dump
```

- Target posture: daily logical backups, 30-day retention, and WAL archiving managed by the primary Postgres platform for the 15-minute RPO target.

## Required secret groups

- Auth: `AUTH_SECRET`, OAuth provider keys
- Messaging: `WHATSAPP_*`, `AT_*`, `VAPID_*`
- AI: `OLLAMA_*`, `ANTHROPIC_API_KEY`
- Storage: `R2_*` or `MINIO_*`
- Observability: `NEXT_PUBLIC_SENTRY_DSN`, `METRICS_BEARER_TOKEN`
- Integrations: `POS_SHARED_SECRET`, `CRON_SECRET`

---

## Multi-region architecture (E-01)

Target steady-state for a customer-facing rollout beyond a single region.

### Service topology

| Tier | Primary region | Failover region |
|---|---|---|
| App (Next.js) | Stateless replicas behind a Cloudflare-managed origin | Same image, warm spare with autoscale 1→N |
| Postgres | RDS / Cloud SQL primary in `af-south-1` (Cape Town) | Cross-region read replica in `eu-west-1` for PITR; promote with `pg_promote` only after the primary is fenced |
| Redis | Managed Redis with Sentinel (ElastiCache Multi-AZ or Memorystore HA) | Cluster failover handled by the managed service |
| Object storage | Cloudflare R2 (multi-region built in) | N/A |
| Ollama | One GPU node per region behind an internal LB; Anthropic fallback path always available | Anthropic Claude becomes primary when both regional Ollama hosts fail |
| Queue (BullMQ) | Same Redis as primary; workers run only in primary region | Cold-start workers in failover region after promotion |

### Traffic management

- **Cloudflare** in front of every public route: WAF rules in `BLOCK` mode for the OWASP CRS top 10, custom rules:
  - rate-limit `/api/auth/request-otp` to 60 req/min/IP (defense in depth — server-side limits remain authoritative)
  - rate-limit `/api/integrations/transactions` to 600 req/min/account, 10 req/sec/IP
  - block requests with unsigned `x-heita-signature` headers at the edge (defense in depth)
  - challenge any request with no `accept-language` and no `cookie`
- **DDoS**: Cloudflare's L7 mitigation is on by default; "Under Attack" mode is the documented break-glass for sustained floods.
- **mTLS** between Cloudflare and the origin via Argo Tunnel; the origin refuses direct internet traffic.
- **Geographic routing**: clients in ZA → `af-south-1`; everyone else → nearest region with read replica.

### Data plane

- Postgres replication is async with a 30-second target RPO. Promotion procedure:
  1. Pause writes by toggling `DEPLOYMENT_READ_ONLY=1` (app respects it via middleware, returning 503 for mutations).
  2. Confirm replica lag < 5 s via `pg_stat_replication`.
  3. Promote replica with `pg_promote()` and rotate `DATABASE_URL` in the failover region.
  4. Restart workers; unset `DEPLOYMENT_READ_ONLY`.
  5. Old primary returns as the new replica after sync.
- pgvector indexes (ivfflat) are part of the schema migrations so promotions inherit them automatically.
- Backup verification: weekly restore drill against an ephemeral instance from the latest WAL chain.

### Required network ACL deltas

- App pods → Postgres primary: TCP 5432 only
- App pods → Redis: TCP 6379 only
- App pods → Ollama: TCP 11434 (private subnet)
- Workers → Postgres + Redis + S3 endpoints
- Egress to Anthropic + Meta + Africa's Talking allowed via a documented egress proxy

---

## Chaos drill playbook (E-02)

These are owner-led game days. Each drill needs an incident lead, an observer, and a documented rollback. Run quarterly in staging, annually in production with traffic shifted away.

### Drill 1 — Redis blackout (15 minutes)

**Goal:** confirm OTP, rate-limit, idempotency, and AI chat all degrade gracefully when Redis disappears.

1. Snapshot `/api/metrics` and the relevant Sentry release.
2. Block the worker security group from the Redis port (`aws ec2 revoke-security-group-ingress …` or `iptables -A OUTPUT -p tcp --dport 6379 -j DROP` on the host).
3. Confirm the following within 60 seconds:
   - `/api/health?deep=1` returns 503 with `checks.redis.ok=false`.
   - `/api/auth/request-otp` still succeeds (in-memory fallback engages; rate limits apply per-instance).
   - Loyalty earn/redeem still succeed (idempotency falls back to in-memory map for the duration).
   - WhatsApp inbound webhook still returns 200 (queue insert skipped; processing runs inline).
4. Restore the security group / `iptables` rule.
5. Verify `/api/health` returns 200 and BullMQ resumes (`bull-board` or `redis-cli LLEN bull:document-ingestion:wait`).
6. Capture observations in the incident doc: latency spikes, error counts, and any user-visible regression.

### Drill 2 — Ollama outage (10 minutes)

**Goal:** prove the Anthropic fallback path is real.

1. Set `OLLAMA_BASE_URL` to an unroutable host and redeploy the AI worker pods.
2. Hit `/api/ai/chat` with a known prompt; expect the Anthropic fallback to answer.
3. Confirm `/api/metrics` shows `heita_ai_chat_requests_total{runtime="anthropic"}` incrementing.
4. Inspect Sentry for the expected `rag.ollama_fallback` warn breadcrumb.
5. Restore `OLLAMA_BASE_URL`, verify primary runtime resumes.

### Drill 3 — Postgres network partition (20 minutes)

**Goal:** confirm read replicas and graceful shutdown actually work.

1. Snapshot live metrics + open Sentry releases.
2. Block primary's port 5432 from app pods (NACL or `iptables -A INPUT -p tcp --dport 5432 -j DROP` on the primary).
3. Within 30 seconds the app should:
   - Return 503 on writes (Prisma surfaces the error; middleware converts to 503).
   - Show `checks.database.ok=false` on `/api/health`.
   - Continue serving cached reads from CDN where possible.
4. Trigger replica promotion per the multi-region procedure.
5. Restore network ACL after the failover sample is captured; old primary rejoins as replica.
6. Document the achieved RTO/RPO against the 1-hour / 15-minute targets.

### Drill 4 — Cosign verification (5 minutes)

Pinned cadence: after every Docker workflow run.

```bash
cosign verify --certificate-identity-regexp "https://github.com/<owner>/heita-crm" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/<owner>/heita-crm@<digest>
```

If verification fails, refuse to roll out and open a security incident.

### Incident artefacts

- Postmortem template lives under `docs/incidents/TEMPLATE.md` (add as needed).
- Sentry release tag must be referenced in every incident note.
- Game-day learnings amend this playbook directly — no separate runbook.

---

## Secrets Rotation Runbook

Rotate secrets on a **90-day cycle** or immediately after any suspected compromise.

### Critical secrets and rotation steps

| Secret | Location | Rotation procedure |
|--------|----------|--------------------|
| `AUTH_SECRET` | GitHub → Settings → Secrets | 1. Generate: `openssl rand -base64 32`. 2. Update GitHub secret. 3. Deploy. 4. All active sessions are invalidated — users must re-authenticate. |
| `WHATSAPP_APP_SECRET` | GitHub + Meta Developer Console | 1. Rotate in Meta Developer Console. 2. Update GitHub secret. 3. Deploy. 4. Verify webhook signature in staging using `deploy-verify.yml`. |
| `YOCO_SECRET_KEY` | GitHub + Yoco Dashboard | 1. Generate new key in Yoco Dashboard. 2. Update GitHub secret. 3. Deploy. 4. Confirm webhook delivery in Yoco logs. |
| `DATABASE_URL` | GitHub + database host | 1. Create new DB user with same grants. 2. Update `DATABASE_URL` secret. 3. Deploy. 4. Verify health endpoint. 5. Drop old DB user after 24 h. |
| `BACKUP_AWS_ACCESS_KEY_ID` + `BACKUP_AWS_SECRET_ACCESS_KEY` | GitHub + AWS IAM | 1. Create new IAM access key. 2. Update GitHub secrets. 3. Trigger manual `backup.yml` run. 4. Verify backup lands in S3. 5. Deactivate old key. |
| `REDIS_URL` | GitHub + Redis provider | 1. Rotate AUTH password on Redis. 2. Update `REDIS_URL`. 3. Deploy. 4. Confirm BullMQ queue connectivity via health endpoint. |
| `DEEPSEEK_API_KEY` / `MINIMAX_API_KEY` | GitHub | Regenerate via provider dashboard, update secret, redeploy. |
| VAPID keys (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`) | GitHub | 1. `npm run vapid:generate`. 2. Update secrets. 3. Deploy. **Note:** all existing push subscriptions become invalid — users must re-subscribe. |

### Rotation checklist

- [ ] New secret value generated and stored in password manager
- [ ] GitHub secret updated via `gh secret set <NAME>`
- [ ] Deployment triggered and health checks green
- [ ] Old secret invalidated / revoked at source
- [ ] Rotation date logged in `docs/secrets-rotation-log.md` (create if absent)
- [ ] Post-rotation smoke test run (`deploy-verify.yml` → workflow_dispatch)
