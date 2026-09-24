# Payment Voucher Pro v2.2 — Voucher Details & Locking

## New behavior
- Every voucher list now has **View Details**.
- The raiser can see the complete PV, expense lines, bank details, status, approval history and payment information.
- Authorized approvers can inspect the complete PV before Approve/Reject.
- Payable Officer can inspect the complete approved PV and bank/payment details before Mark Paid.
- Raiser can edit while status is:
  - DRAFT
  - REJECTED
  - PENDING_APPROVAL
- Editing a PENDING_APPROVAL voucher automatically:
  - creates a new revision,
  - recalculates the workflow from the edited amount/department,
  - restarts approval from Level 1,
  - preserves old approval actions as historical records.
- Once status reaches APPROVED_PENDING_PAYMENT or later, editing is locked permanently.
- Payment screen now captures payment method, payment account/bank and payment reference.

## Upgrade
Keep your existing `.env`.

Copy the v2.2 files over your current v2.1 project, then run:
1. `npm install`
2. `npx prisma generate`
3. `npx prisma migrate deploy`
4. `npm start`

There is no new database migration in v2.2.
