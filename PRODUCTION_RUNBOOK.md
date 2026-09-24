# Payment Voucher Pro v3.0 Production Runbook

## Before internet deployment
- Use a managed PostgreSQL database or a properly administered server; do not expose PostgreSQL port 5432 publicly.
- Set a long random JWT_SECRET and keep `.env` outside source control.
- Put Node behind HTTPS (reverse proxy/load balancer).
- Set NODE_ENV=production.
- Configure SMTP credentials in environment/configuration; never hard-code passwords.
- Take and restore-test database backups.
- Restrict server/firewall access and apply OS/PostgreSQL security updates.
- Use process supervision (PM2/systemd/container platform) and centralized logs.

## Incident response
### Broken access control
Disable affected user/session, preserve audit logs, reproduce the unauthorized request, fix backend authorization (never UI-only), rotate secrets if exposure is possible, and review affected PVs.

### Injection / malicious input
Block the source if appropriate, preserve request logs, patch validation/query handling, review DB integrity, rotate credentials if compromise is suspected.

### Exposed admin/JWT/SMTP/database secrets
Rotate immediately, revoke sessions, update deployment secrets, inspect audit/auth logs and database activity.

### Suspicious logins
Deactivate/revoke the user, reset password, review LoginEvent and AuditLog records, verify role changes and PV actions.

### DDoS/rate spikes
Use reverse-proxy/cloud rate limiting, temporarily tighten API limits, scale app replicas, and protect the database connection pool.

### Database overload
Check active connections/slow queries, add indexes only from evidence, reduce expensive report ranges, scale database resources, and introduce caching/read replicas when justified.

### Queue/email failures
Payment workflow must remain valid even if email fails. Retry notification delivery separately; never roll back a valid approval/payment solely because SMTP is unavailable.

### Backup/restore
Run `npm run backup` where `pg_dump` is installed. Maintain encrypted off-server copies. Regularly restore to a non-production database and verify voucher/expense counts.

### Outage
Put up maintenance messaging, preserve logs, restore DB/app service, verify migrations, run smoke tests: login → view PV → report → health check.

### Data breach
Contain access, rotate secrets, preserve evidence, identify affected users/data/time window, follow applicable legal/regulatory notification obligations, remediate and document.

## Capacity thresholds
Watch p95 API latency, DB CPU/storage/connections, error rate and report query duration. As users/PVs grow, add pagination, indexes, caching, background email jobs, object storage for attachments, and horizontal app scaling.
