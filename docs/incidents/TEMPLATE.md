# Incident Postmortem — [INC-YYYY-NNN] Short title

| Field | Value |
|---|---|
| **Date** | YYYY-MM-DD |
| **Severity** | SEV1 / SEV2 / SEV3 |
| **Duration** | HH:MM |
| **Incident Commander** | @handle |
| **Scribe** | @handle |
| **Status** | Draft / In Review / Closed |

---

## Summary

One paragraph describing what broke, who was affected, and how it was resolved.

---

## Impact

- **Customer-facing**: describe what customers experienced (errors, degraded performance, data unavailability)
- **Business impact**: revenue, SLA breach, reputational risk
- **Scope**: % of requests / number of users / affected tenants

---

## Timeline (UTC)

| Time | Event |
|---|---|
| HH:MM | Incident begins |
| HH:MM | First alert fires / first customer report |
| HH:MM | On-call paged |
| HH:MM | Incident channel opened |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | Incident closed |

---

## Root Cause

Detailed technical explanation of what caused the failure. Include:
- What changed (code, config, infra, external dependency)
- Why the change caused the failure
- Why monitoring/alerting did not catch it sooner

---

## Contributing Factors

- Factor 1
- Factor 2

---

## What Went Well

- Item 1
- Item 2

---

## What Went Poorly

- Item 1
- Item 2

---

## Action Items

| Priority | Owner | Task | Due |
|---|---|---|---|
| P1 | @handle | Short description of action | YYYY-MM-DD |
| P2 | @handle | Short description of action | YYYY-MM-DD |

---

## Lessons Learned

Key takeaways for the team — architectural decisions, process gaps, tooling improvements.

---

## References

- Alert / PagerDuty link
- Relevant Sentry issues
- Related PRs or commits
- Runbook: `docs/runbooks/RELEVANT-RUNBOOK.md`
