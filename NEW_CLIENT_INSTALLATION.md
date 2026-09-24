# Payment Voucher Pro v4.4 — New Client Installation

## Golden rule
Never reuse another client's PostgreSQL database.

Reuse the application code, but create a brand-new empty database and unique `.env` for every company.

## New-client process

1. Extract the v4.4 release into a new client folder.
2. Copy `.env.client.example` to `.env`.
3. Create a brand-new empty PostgreSQL database.
4. Update `DATABASE_URL` and create a unique `JWT_SECRET`.
5. Run:

   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run setup:client

6. Enter the company details and first Super Admin details.
7. Start the system:

   npm start

The installer refuses to run if it detects existing staff, users, workflows, vouchers, payments, expenses, attachments, notifications or audit records.

## What setup:client creates
- Standard roles
- Permissions
- Role-permission mapping
- Standard expense-category master data
- Blank PV sequence starting at zero
- Company master settings
- First SUPER_ADMIN

## What it DOES NOT create
- Staff records
- Payment Vouchers
- Approval workflows
- Approval transactions
- Payments
- Expenses
- Supporting documents
- Payment evidence
- Transaction history

The first Super Admin receives a temporary strong password and must change it on first sign-in.

## Client separation
Recommended model:

Payment Voucher Pro v4.4
├── Client A → Database A + Client A .env
├── Client B → Database B + Client B .env
└── Client C → Database C + Client C .env

Never place multiple unrelated clients into the same database unless a future multi-tenant architecture is deliberately designed and security-reviewed.

## Updating an existing client later
Do NOT run `setup:client` again.

For a future application release, back up the database first, deploy the new code, then run only the documented migration/upgrade procedure for that release.

## Before handing over
- Save the client `.env` securely.
- Change the Super Admin temporary password.
- Configure company logo/settings.
- Import or create Staff.
- Configure Approval Setup.
- Confirm document requirements.
- Create a database backup.
- Run one end-to-end test PV.
