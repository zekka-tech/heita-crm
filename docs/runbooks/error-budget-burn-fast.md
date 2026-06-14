# ErrorBudgetBurnFast

Alert source: `prometheus-rules.yml`
Severity: see alert labels in Prometheus.

## Impact

Availability SLO is burning budget fast.

## First checks

1. Open the Grafana SLO overview dashboard and confirm whether this is isolated or part of a wider incident.
2. Page on-call, freeze non-critical releases, and mitigate user-facing 5xx immediately.
3. Check recent deploys, feature-flag changes, migrations, provider status pages, and Sentry for matching timestamps.

## Mitigation

1. If customer-facing critical paths are affected, declare an incident and follow `docs/ONCALL.md`.
2. Roll back or disable the most likely recent change when the blast radius is clear.
3. Prefer queue pause/backoff over destructive retries until the failure mode is understood.
4. Record timeline, customer impact, and commands run in the incident doc.

## Escalation

- Critical/page alerts: page primary on-call immediately, then secondary if not acknowledged within 10 minutes.
- Warning/ticket alerts: create a reliability ticket and escalate if the signal worsens or customer impact is confirmed.

## Resolution

- Alert is resolved or acknowledged with a known false-positive reason.
- Customer-impacting failures have a mitigation in place.
- A follow-up issue exists for root cause and test/monitoring gaps.
- If Sev-1/Sev-2, complete `docs/incidents/POSTMORTEM_TEMPLATE.md` within 2 business days.

## Release gate

`scripts/check-error-budget.mjs` is wired into CI (`.github/workflows/ci.yml`, `security` job) as the **Error-budget release gate** step. It runs on every PR and push to main/release branches.

### How it works

The script reads `docs/error-budget-status.json` (the sentinel file) and exits 1 if `budgetExhausted: true`, blocking the deploy. The sentinel file shape is:

```json
{ "budgetExhausted": false, "burnRate": 0.12, "updatedAt": "2026-06-14T00:00:00Z" }
```

When `budgetExhausted` is `true`, the CI step prints a clear error message and blocks the deploy:

```
[error-budget-gate] BLOCKED: availability error budget is exhausted.
Current burn rate: 14.40x (as of 2026-06-14T10:00:00Z).
Freeze non-critical releases until budget recovers.
```

### Wiring to live Prometheus

When your Prometheus endpoint is reachable from CI runners (e.g. via a VPN-connected runner or a scrape sidecar):

1. Set `PROMETHEUS_URL` as a GitHub Actions secret.
2. Extend `scripts/check-error-budget.mjs` to query
   `${PROMETHEUS_URL}/api/v1/query?query=<burn_rate_expr>` using the
   multi-window expressions from `prometheus-rules.yml` (`ErrorBudgetBurnFast`).
3. A separate scrape job (e.g. a scheduled workflow or a Prometheus recording rule
   that writes results to the repo via the GitHub API) should keep
   `docs/error-budget-status.json` up to date.
4. Remove or archive `docs/error-budget-status.json` once the live path is active.

Until a live Prometheus scrape job writes `docs/error-budget-status.json` the gate
is **non-blocking** (exits 0 when the file is absent), so CI remains green in
environments without a running Prometheus instance.
