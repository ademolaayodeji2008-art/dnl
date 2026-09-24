# Payment Voucher Pro v3.0 Production Candidate

Includes:
- Full PV lifecycle and revision locking
- Multi-user approval levels
- Full Voucher Details
- CEO / Account Officer / Payable Officer / Finance / Admin report access
- Report dashboard
- Top 7 expense categories by selected date range
- Monthly expense trend
- Report preview and category/date filtering
- Printable / Save-as-PDF Payment Voucher
- Company settings data model
- Security headers and API/login rate limiting
- Backup script and production incident/scaling runbook
- Attachment data model foundation

## Upgrade existing database
Keep your current `.env`.

npm install
npx prisma generate
npx prisma migrate deploy
npm run upgrade:v3
npm start

## Important
This is a production candidate, not a claim that deployment is secure merely because the code runs. Before real-world public deployment, complete the acceptance/security checklist in PRODUCTION_RUNBOOK.md and deploy behind HTTPS with production secrets and backups.
