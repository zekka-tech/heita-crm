# Deployment — Docker Compose on a VPS (Option 1)

The lowest-friction path: run the existing `docker-compose.prod.yml` on a single
VPS (DigitalOcean Droplet, Hetzner, Linode, EC2…), fronted by the in-stack Caddy
reverse proxy, with Cloudflare for DNS/CDN in front of that.

```
Internet ──▶ Cloudflare (DNS/CDN/WAF) ──▶ caddy :443 ──▶ app :3000
                                                          │
                          heita_internal (no egress) ◀────┤
                              ├─ postgres :5432
                              └─ redis :6379
```

- **`heita_internal`** (internal, no internet): postgres, redis, app, migrate.
- **`heita_edge`** (normal bridge): app + caddy. Gives the app outbound access
  to Anthropic / Meta WhatsApp / Africa's Talking / R2, and carries inbound
  proxied traffic. The app port is bound to `127.0.0.1` only — never public.

## 1. Provision the host

- 2 vCPU / 4 GB RAM minimum (Postgres is capped at 4 GB, app at 2 GB).
- Install Docker Engine + the Compose plugin.
- Open inbound `80` and `443` only (e.g. `ufw allow 80,443/tcp`). Postgres/Redis
  are never published.

## 2. Get the repo + secrets onto the box

```bash
git clone <repo> heita && cd heita
cp .env.production.example .env.production
$EDITOR .env.production        # fill in every value; see notes below
```

`.env.production` notes:
- `DATABASE_URL` / `REDIS_URL` use **service names** (`@postgres:5432`,
  `@redis:6379`), not `localhost`.
- `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are required (compose fails without
  them) and must match the credentials embedded in the URLs above.
- `DOMAIN` and `ACME_EMAIL` drive the Caddyfile.
- Copy all remaining application keys from `.env.example` and set real values.

## 3. Authenticate to GHCR (if the image is private)

```bash
echo "$GITHUB_PAT" | docker login ghcr.io -u <user> --password-stdin
```

The image is built, Trivy-scanned and Cosign-signed in CI — never add a `build:`
block to the prod compose file.

## 4. DNS + Cloudflare TLS

1. Point `DOMAIN` at the VPS public IP (A/AAAA record).
2. Set Cloudflare **SSL/TLS mode** and match the Caddyfile:
   - **Full (strict)** *(recommended)* — install a Cloudflare Origin Certificate
     and uncomment the `tls` block in the `Caddyfile` (instructions inline).
   - **Full** — leave the default Caddyfile; Caddy obtains a Let's Encrypt cert.
   - Never use **Flexible** (unencrypted origin hop).

## 5. Deploy

```bash
./scripts/deploy.sh v1.4.2     # pin a released tag (recommended)
# or
./scripts/deploy.sh            # uses :latest
```

The script: pulls images → runs `prisma migrate deploy` as a one-shot
container → `up -d` → polls `/api/health/live` → prunes dangling images.

### What runs migrations
The standalone runtime image has `prisma` pruned (devDependency), so it cannot
self-migrate. The `migrate` service (behind the `migrate` compose profile) runs
`npx prisma@7 migrate deploy` from a clean Node image with `./prisma` mounted,
on `heita_internal`. The deploy script invokes it before starting the app. For a
brand-new database, the pgvector extension is created by
`docker/postgres/init.sql` at first boot.

## 6. Operate

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f app

# Status / health
docker compose -f docker-compose.prod.yml ps
curl -s http://127.0.0.1:3000/api/health?deep=1

# Rollback to a previous tag (no down-migration — forward-fix the schema)
./scripts/deploy.sh v1.4.1

# Stop / start
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Scheduled jobs (cron)

The app exposes its background jobs as POST `/api/cron/*` endpoints. They are
**not** self-scheduling — point an external scheduler (host `crontab`, systemd
timer, or a hosted cron service) at them. Every endpoint authenticates with the
shared secret, sent as `Authorization: Bearer $CRON_SECRET` (or an
`x-cron-secret:` header), and is safe to over-fire (idempotent / internally
locked).

| Endpoint | Purpose | Suggested cadence |
|---|---|---|
| `/api/cron/broadcast-promotions` | Dispatch promotions whose send time has arrived | every 15 min |
| `/api/cron/send-reminders` | Send due loyalty / points reminders | hourly |
| `/api/cron/cleanup-otp` | Purge expired OTP codes | hourly |
| `/api/cron/expire-points` | Expire points past their TTL | daily |
| `/api/cron/recalculate-tiers` | Recompute membership tiers | daily |
| `/api/cron/purge-whatsapp-messages` | Delete WhatsApp messages past retention | daily |
| `/api/cron/hard-delete-users` | Hard-delete users past the soft-delete window | daily |
| `/api/cron/refresh-web-sources` | Re-crawl AI web sources whose refresh interval elapsed (unchanged pages skipped via `contentHash`) | daily |

Example host `crontab` (replace `$DOMAIN`; keep `CRON_SECRET` out of the crontab
file itself — source it from a root-only env file):

```cron
# /etc/cron.d/heita  — runs in UTC; %-signs must be escaped in cron.d
CRON_SECRET_FILE=/etc/heita/cron.env
*/15 *  * * *  root  . /etc/heita/cron.env; curl -fsS -m 60 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/broadcast-promotions
0    *  * * *  root  . /etc/heita/cron.env; curl -fsS -m 60 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/send-reminders
15   *  * * *  root  . /etc/heita/cron.env; curl -fsS -m 60 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/cleanup-otp
0    2  * * *  root  . /etc/heita/cron.env; curl -fsS -m 120 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/expire-points
30   2  * * *  root  . /etc/heita/cron.env; curl -fsS -m 120 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/recalculate-tiers
0    3  * * *  root  . /etc/heita/cron.env; curl -fsS -m 120 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/purge-whatsapp-messages
30   3  * * *  root  . /etc/heita/cron.env; curl -fsS -m 120 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/hard-delete-users
0    4  * * *  root  . /etc/heita/cron.env; curl -fsS -m 600 -X POST -H "Authorization: Bearer $CRON_SECRET" https://$DOMAIN/api/cron/refresh-web-sources
```

`refresh-web-sources` only enqueues crawl jobs (the BullMQ `web-crawl` worker does
the work), so its request returns quickly; give it a longer `-m` only if you run
crawls inline (`AI_INGEST_INLINE=1`).

### Backups
Postgres data lives in the `postgres_data` volume. Schedule
`pg_dump`/`pgBackRest` against the `postgres` container and ship dumps off-box
(the existing `.github/workflows/backup.yml` covers the managed path).

## Alternative: host-level Nginx/Caddy instead of the in-stack proxy
If you prefer to run Nginx/Caddy directly on the host (not as a compose
service), drop the `caddy` service and proxy to `127.0.0.1:3000` — the app port
is already bound there. Everything else is unchanged.
