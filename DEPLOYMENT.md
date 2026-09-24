# Production Deployment

## Recommended architecture
- App: Node.js web service
- Database: Managed PostgreSQL
- HTTPS: Provided by host/reverse proxy
- Email: Gmail App Password, Microsoft SMTP, SendGrid, Mailgun, Postmark, etc.

## Render / Railway / VPS
Set these environment variables:
- DATABASE_URL
- JWT_SECRET
- APP_URL
- SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
- EMAIL_NOTIFICATIONS_ENABLED=true

Build/start:
- Build: `npm install && npx prisma generate`
- Start: `npx prisma migrate deploy && node server.js`

## Initial administrator
Before running `node prisma/seed.js`, set:
- INITIAL_ADMIN_EMAIL
- INITIAL_ADMIN_PASSWORD
- INITIAL_ADMIN_FIRST_NAME
- INITIAL_ADMIN_LAST_NAME

Then run the seed once.

## Approval setup for your workflow
1. Create/assign an Account Officer user.
2. Create/assign a CEO user.
3. Create/assign a Payable Officer user.
4. Create Workflow: `General Payment Approval`, minimum amount `0`.
5. Add Level 1: `Account Officer / CEO`.
6. Set mode `ANY`.
7. Minimum approvals `1`.
8. Authorize both the Account Officer and CEO on Level 1.

Either can approve or reject. Once approved, the PV moves to the Payable Officer queue.
