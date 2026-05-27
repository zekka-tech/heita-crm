# Incident Response Runbook

## Severity Levels
- **SEV1 (Critical)**: Data breach, authentication bypass, total outage — respond in 15 min, notify in 1 hour
- **SEV2 (High)**: Partial outage, performance degradation — respond in 30 min
- **SEV3 (Medium)**: Single-feature failures — respond in 4 hours

## Log Correlation Workflow
1. Get X-Request-ID from error report or HTTP response header
2. Search logs: `grep "requestId" /var/log/heita/ | grep "<requestId>"`
3. Look up Sentry release for the timestamp at https://sentry.io/organizations/heita/releases/
4. Cross-reference Prometheus metrics at /metrics for the time window

## POPIA Breach Notification (s26)
1. Confirm scope: what data, how many users, what was exposed
2. **Within 72 hours**: Notify POPIA Information Regulator: inforeg@justice.gov.za
3. **Without undue delay**: Notify affected users by email/WhatsApp with: what happened, what data, what we did, what they should do
4. Log incident in COMPLIANCE_DOCS/BREACH_REGISTER.md

## Emergency Failover (Multi-Region)
1. Declare incident in #incidents Slack channel
2. Pause writes: set `MAINTENANCE_MODE=1` env var and redeploy
3. Verify replica lag: `psql $DATABASE_URL -c "SELECT * FROM pg_stat_replication;"`
4. Promote replica: `psql $REPLICA_URL -c "SELECT pg_promote();"`
5. Rotate DATABASE_URL to new primary
6. Redeploy app with new connection string

## Database Emergency
- Emergency read-only mode: remove write permissions on DB user
- Restore from backup: `aws s3 cp s3://heita-backups/latest.dump.gz . && gunzip | psql $DATABASE_URL`

## Contact Escalation
- On-call engineer: Check PagerDuty schedule
- Data Protection Officer: privacy@heita.co.za
- POPIA Information Regulator: +27 12 406 4818
