# Runbook: Synthetic Probe Failure

## What this workflow does

`.github/workflows/synthetic-probe.yml` runs three HTTP checks against the
production URL (`vars.PROD_BASE_URL`) every 15 minutes and on manual trigger:

| Step | Endpoint | Expectation |
|---|---|---|
| health_ready | `GET /api/health/ready` | HTTP 200 |
| business_page | `GET /b/<PROBE_BUSINESS_SLUG>` | HTTP 200, non-empty body |
| metrics | `GET /api/metrics` (Bearer `METRICS_TOKEN`) | HTTP 200 |

If any check fails the job exits non-zero, GitHub marks the run red, and (if
`SLACK_WEBHOOK_URL` is configured) a Slack message is posted to the configured
channel.

---

## Receiving an alert

1. Open the failed workflow run linked in the Slack message (or navigate to
   **Actions → Synthetic Probe** in the repo).
2. Expand each step and read the `curl` error output — the HTTP status code and
   any error message are printed before the failure.
3. Run the failing check manually from your machine to confirm:

```bash
BASE_URL="https://app.heita.co.za"

# Check 1
curl -fsSL --max-time 10 "${BASE_URL}/api/health/ready"

# Check 2
curl -fsSL --max-time 10 "${BASE_URL}/b/<your-slug>"

# Check 3 (replace TOKEN)
curl -fsSL --max-time 10 \
  -H "Authorization: Bearer <METRICS_TOKEN>" \
  "${BASE_URL}/api/metrics"
```

---

## Triage by symptom

### All three checks fail

The entire service is unreachable. Likely causes:

- VPS is down or network-unreachable — check cloud-provider status page and SSH
  to the host.
- Caddy/Docker has crashed — `docker compose -f docker-compose.prod.yml ps` on
  the host.
- Cloudflare is blocking traffic — check CF firewall/WAF events.

Quick remediation:

```bash
# On the VPS
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 app
docker compose -f docker-compose.prod.yml restart app
```

### Only health_ready fails (200 expected, got non-200 or connection refused)

The app process is up but unhealthy. Check:

- `docker compose logs app | tail -100` — look for Prisma/Redis connection errors.
- `docker compose exec app wget -qO- http://localhost:3000/api/health/ready`
  for a more detailed JSON diagnostic.
- Postgres or Redis may have restarted and not yet accepted connections.

### Only business_page fails

- The slug in `vars.PROBE_BUSINESS_SLUG` might not exist in the production
  database (seeded to staging only, or was deleted). Update the repo variable
  to a known-active slug.
- The public business route may have a rendering error — check app logs.

### Only metrics fails

- `METRICS_TOKEN` secret may have been rotated but not updated in GitHub
  (`Settings → Secrets and variables → Actions → METRICS_TOKEN`).
- The `/api/metrics` endpoint returns 401 if the token mismatches or 404 if the
  route was not built — check the app logs.

---

## Temporarily disabling the probe

If the production environment is intentionally down (planned maintenance) and
you want to suppress alerts:

1. Navigate to **Actions → Synthetic Probe → (three-dot menu) → Disable workflow**.
2. Re-enable it after maintenance with **Enable workflow**.

Alternatively, trigger a manual run with a different base URL override via
`workflow_dispatch` to verify a staging environment without touching production.

---

## Required repository configuration

| Type | Name | Value |
|---|---|---|
| Variable | `PROD_BASE_URL` | `https://app.heita.co.za` (no trailing slash) |
| Variable | `PROBE_BUSINESS_SLUG` | Slug of a live test business on production |
| Variable | `SLACK_WEBHOOK_URL` | *(optional)* Slack incoming webhook URL |
| Secret | `METRICS_TOKEN` | Bearer token matching `METRICS_BEARER_TOKEN` in `.env.production` |
| Secret | `SLACK_WEBHOOK_URL` | *(optional)* Use a secret instead of a variable for the webhook URL |

If `PROBE_BUSINESS_SLUG` is not set, the business-page check will probe `/b/`
(empty slug) and will likely fail — set it to a valid slug.
