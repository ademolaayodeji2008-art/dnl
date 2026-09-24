# Payment Voucher Pro v4.1 — Document Requirements & Payment Evidence

## New features
- Admin controls Supporting Documents: Optional or Required before PV submission.
- Admin controls Payment Evidence: Optional or Required before Mark Paid.
- Supporting documents remain linked to the PV.
- Payable Officer can upload Payment Evidence while a PV is:
  - APPROVED_PENDING_PAYMENT
  - PAID_AWAITING_CONFIRMATION
- Payment evidence is visible to the raiser, authorized management users, approvers, Payable Officer, Admin and Super Admin through View Details.
- Raiser can download payment evidence before confirming receipt.
- Payment evidence is locked after receipt confirmation / COMPLETED status.
- Supporting documents and payment evidence are displayed in separate sections.
- Audit log distinguishes supporting-document and payment-evidence upload/delete events.

## Upgrade
Keep your existing `.env`.

Run:
1. npm install
2. npx prisma format
3. npx prisma generate
4. npx prisma migrate deploy
5. npm start

A new Prisma migration adds `attachmentType` to existing VoucherAttachment records. Existing attachments automatically become SUPPORTING.

## Admin setup
Settings → Document Requirements:
- Supporting Documents: Optional / Required before submission
- Payment Evidence: Optional / Required before Mark Paid
