# On-call

## Rotation

- Primary on-call owns production pages for the current week.
- Secondary on-call is backup and takes over when the primary does not acknowledge within 10 minutes.
- Business owner escalation is required for Sev-1 customer-impacting incidents, data-loss risk, or release-freeze overrides.

## Alert response

1. Acknowledge the alert in PagerDuty or Slack.
2. Open the matching runbook under `docs/runbooks/`.
3. Check `docs/SLO.md` for error-budget policy and release-freeze criteria.
4. Create an incident doc for Sev-1/Sev-2 using `docs/incidents/POSTMORTEM_TEMPLATE.md`.
5. Communicate customer impact, mitigation, and next update time in the incident channel.

## Severity

- Sev-1: platform unavailable, data integrity risk, payment/webhook ingestion broken, or widespread auth failure.
- Sev-2: degraded critical journey with workaround, elevated error-budget burn, or queue backlog with delayed customer impact.
- Sev-3: localized degradation, warning alerts, or non-critical background failure.

## Release policy during incidents

- Freeze non-critical releases during Sev-1/Sev-2 or when Tier-1 error budget is exhausted.
- Only reliability fixes, security patches, rollback commits, and explicitly approved mitigations may ship.
