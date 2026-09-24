# Payment Voucher Pro v4.0 Production Release Candidate

Built from the user-confirmed v3.1 working baseline. Deployment/hosting is intentionally excluded. Email notifications remain optional and disabled by default.

## Added
- Secure supporting-document uploads (PDF/JPG/PNG/WEBP/DOCX/XLSX), max size control, authenticated download, pre-approval removal lock.
- Advanced voucher search with status, department, date range, PV/payee/description/staff/payment-reference search and pagination.
- Audit Trail Viewer with filters and pagination.
- User activate/deactivate and admin password reset.
- Staff activate/deactivate synchronized to linked user account.
- System Health / Admin Diagnostics.
- Database indexes for voucher, notification and audit scale.
- CORS allowlist support and cleaned security middleware.
- Email notifications disabled by default; client-specific option only.

## Upgrade
Keep your existing `.env`. Copy any client secrets manually.

Run:
1. npm install
2. npx prisma format
3. npx prisma generate
4. npx prisma migrate deploy
5. npm start

Optional .env additions:
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=10
CORS_ORIGINS=
EMAIL_NOTIFICATIONS_ENABLED=false

## Acceptance Test
Test existing PV lifecycle first, then attachment upload/download, advanced search, audit viewer, user deactivation/reactivation, password reset, staff status, reports/export, notification bell, system health, and backup/restore in a test database.
