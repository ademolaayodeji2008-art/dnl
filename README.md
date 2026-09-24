# Dariltweens Nigeria Limited — Payment Voucher Pro

A standalone hosted payment voucher web application with PostgreSQL, Node.js/Express, Prisma and a fast single-page frontend.

## Included
- Staff pre-registration and self-registration
- Admin-created users and role assignment
- Remembered login email
- Role/permission access control
- Auto-generated PV numbers
- Admin-controlled expense category dropdown
- Multi-line vouchers
- Configurable approval workflows, levels and authorized approvers
- Account Officer / CEO approval support
- Rejection and resubmission
- Payable officer queue
- Automatic expense posting after payment
- Staff receipt confirmation
- Email + in-app notifications
- Dashboard
- Date-range/status/category reports
- Excel expense export
- Staff CSV import/export
- Light/dark mode
- Loading overlays and sign-out loading
- Audit log backend
- PostgreSQL database
- Docker deployment

## First Run
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and `JWT_SECRET`.
3. Optionally set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` before seeding.
4. Run:
   - `npm install`
   - `npx prisma generate`
   - `npx prisma migrate dev --name init`
   - `node prisma/seed.js`
   - `npm start`
5. Open `http://localhost:3000`.

See `DEPLOYMENT.md` for production hosting.
