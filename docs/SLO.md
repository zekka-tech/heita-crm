# Service Level Objectives, Error Budgets & Release Criteria

Owner: Engineering. Review cadence: quarterly, or after any Sev-1.
Companion docs: [OPERATIONS.md](../OPERATIONS.md), [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md).

This document defines what "healthy" means for Heita CRM in measurable terms, the
error budget that governs release pace, and the explicit go/no-go gate every
release must pass. SLIs are derived from `/api/metrics` (Prometheus) and the
`/api/health` probes; see OPERATIONS.md for the metric names.

## 1. Service Level Objectives

SLOs are measured over a **rolling 28-day window**, per production region.

| # | Service / journey | SLI | SLO target |
|---|---|---|---|
| A1 | API availability (non-5xx on user-facing routes) | `1 - rate(5xx) / rate(all)` | **99.9%** |
| A2 | App read latency (p95) — GET pages & read APIs | request duration p95 | **< 500 ms** |
| A3 | Write latency (p95) — loyalty earn/redeem, receipt submit | request duration p95 | **< 800 ms** |
| A4 | OTP request success rate | `1 - rate(otp_errors) / rate(otp_requests)` | **99.5%** |
| A5 | AI chat success (Ollama **or** Anthropic fallback answers) | `1 - rate(ai_chat_failures) / rate(ai_chat_requests)` | **99.0%** |
| A6 | Webhook ingestion (WhatsApp / Africa's Talking) | `2xx responses / total received` | **99.9%** |
| A7 | Async job completion (BullMQ) within 5 min | jobs completed ≤ 5 min / total | **99.0%** |

### Tiered route classes
- **Tier 1 (revenue/critical):** auth/OTP, loyalty earn/redeem, billing, webhooks.
  A Tier-1 SLO miss freezes releases immediately (see §3).
- **Tier 2 (engagement):** AI chat, notifications, discovery, receipts.
- **Tier 3 (best-effort):** analytics, non-blocking background enrichment.

## 2. Error budgets

The error budget is `(1 - SLO)` over the 28-day window.

| SLO | Monthly budget |
|---|---|
| 99.9% | ~43 min of failure |
| 99.5% | ~3.6 h |
| 99.0% | ~7.2 h |

**Budget policy**
- **Budget healthy (> 25% remaining):** ship at normal cadence.
- **Budget low (≤ 25% remaining):** non-critical feature releases pause; only
  reliability fixes, security patches, and budget-neutral changes ship.
- **Budget exhausted (≤ 0):** **release freeze** on the affected tier until the
  budget recovers above 25% and a corrective action is merged. Exceptions
  require a documented sign-off in the release issue.

Burn-rate alerting (configure in Sentry/alertmanager):
- **Fast burn:** 2% of 28-day budget in 1 h → page on-call.
- **Slow burn:** 5% of 28-day budget in 6 h → ticket + Slack.

## 3. Recovery objectives (DR)

Aligned with the multi-region procedure and chaos Drill 3 in OPERATIONS.md.

| Objective | Target |
|---|---|
| **RTO** (time to restore service after region/primary loss) | **≤ 1 hour** |
| **RPO** (max acceptable data loss) | **≤ 15 minutes** |

These are validated, not assumed — see the quarterly game-day evidence
(`.github/workflows/game-day.yml`) and weekly backup verification
(`.github/workflows/backup-verify.yml`).

## 4. Release go/no-go gate

A release to staging→production is **GO** only when every box is checked. Each
maps to an automated gate already in CI (`.github/workflows/ci.yml`) or a named
manual control. Record the outcome in the release/PR description.

### Automated (must be green on the release branch)
- [ ] `quality`: typecheck, lint, unit tests **with coverage enforcement**, build
- [ ] `quality`: tenant-scope static gate (`scripts/check-prisma-tenant-scope.sh`)
- [ ] `quality`: migration drift check + destructive-migration safety gate
- [ ] `e2e`: full Playwright suite passes
- [ ] `playwright-smoke`: PR smoke gate passes
- [ ] `security`: `npm audit` (moderate, blocking), Trivy (fail on CRITICAL),
      gitleaks, SBOM generated
- [ ] `bundle-size`: within budget
- [ ] `lighthouse`: Web Vitals within budget
- [ ] Container image is Cosign-verified before rollout (chaos Drill 4)

### Manual / operational
- [ ] Error budget for all **Tier-1** routes is not exhausted (§2)
- [ ] No open Sev-1/Sev-2 incident for an affected subsystem
- [ ] DB migrations reviewed; destructive changes carry `migration-approved`
- [ ] Rollback plan stated (previous image tag pinned — see DEPLOYMENT.md §6)
- [ ] Required secrets present for the target env (OPERATIONS.md)
- [ ] Post-deploy smoke (`deploy-verify.yml`) scheduled/triggered against the env

**NO-GO** if any automated gate is red, a Tier-1 budget is exhausted, or a
relevant Sev-1/Sev-2 is open. A NO-GO override requires written sign-off from the
release owner recorded in the release issue.

## 5. How SLO attainment is reviewed

- Weekly: on-call reviews burn-rate alerts and the `/api/metrics` dashboard.
- Monthly: SLO attainment vs. target recorded; misses get a corrective action.
- Quarterly: this document and the targets above are re-validated against actual
  traffic and the executed game-day evidence.
