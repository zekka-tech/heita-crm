# AiChatErrorBudgetBurnSlow

Alert source: `prometheus-rules.yml`
Severity: see alert labels in Prometheus.

## Impact

AI chat SLO is burning budget slowly.

## First checks

1. Open the Grafana SLO overview dashboard and confirm whether this is isolated or part of a wider incident.
2. Open a reliability ticket; check Ollama and Anthropic fallback reliability before further AI releases.
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
