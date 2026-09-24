# Payment Voucher Pro v4.3.2 — Admin Role & Separation of Duties

ADMIN is now an operational administrator.

ADMIN can access:
- Dashboard
- All operational PV visibility
- Staff
- Expense Categories
- Reports / Report Dashboard
- Advanced Search
- Supporting documents and payment evidence
- Print / PDF / Excel operational reports

ADMIN cannot access:
- Users & Roles
- Approval Setup
- Audit Trail
- System Health
- Backup & Restore
- Settings

SUPER_ADMIN retains full access.

The restriction is enforced in both the user interface and backend API.

Upgrade:
npm install
npx prisma format
npx prisma generate
npx prisma migrate deploy
npm run upgrade:v4.3.2
npm start

No new Prisma migration is required by v4.3.2.
