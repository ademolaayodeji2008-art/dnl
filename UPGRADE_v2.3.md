# Payment Voucher Pro v2.3 — Complete Build

This is a complete project build, not a patch.

## Major additions
- Full Voucher Details for raiser, approvers, Payable Officer and report viewers.
- Edit before approval; approved vouchers lock automatically.
- Account Officer now has REPORT_VIEW and EXPENSE_VIEW.
- Reports Centre has Preview Report for:
  - All Payment Vouchers
  - Pending Approval
  - Approved / Pending Payment
  - Paid / Awaiting Confirmation
  - Completed
  - Rejected
  - Expenses
- Date From / Date To filters.
- Expense Category filter.
- Report summary cards.
- View PV directly from report preview.
- Print Preview.
- Expense Excel export.
- Frontend no-cache during local development.

## Install over your current project
Keep your existing `.env`.

1. Stop the server.
2. Back up the current project.
3. Replace the project files with this v2.3 project.
4. Keep/copy your existing `.env` into the v2.3 root.
5. Run:

npm install
npx prisma generate
npx prisma migrate deploy
npm run upgrade:v2.3
npm start

The `upgrade:v2.3` command grants REPORT_VIEW and EXPENSE_VIEW to the existing ACCOUNT_OFFICER role in your current database.

## Verify
- Login as Account Officer: Reports should now be visible.
- Open Reports and preview each report.
- Open a voucher from My Vouchers / Pending Approvals / Pending Payments / Reports using View Details.
