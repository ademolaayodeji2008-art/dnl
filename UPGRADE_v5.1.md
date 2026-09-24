# DARILTWEENS NIGERIA LIMITED — v5.1 Upgrade

## What v5.1 adds
- Collapsible grouped sidebar navigation.
- Professional invoice entry and invoice view.
- Split settlement on invoice creation: cash/transfer/POS/other + one or more PDCs.
- Atomic Save Invoice & Settlement workflow.
- PDC lifecycle: HELD / due / not yet due -> PRESENTED -> CLEARED or BOUNCED; HELD/PRESENTED/BOUNCED can be cancelled as "Do Not Tender"; BOUNCED/CANCELLED can be replaced.
- Uncleared PDCs do not reduce receivables.
- Company Bank Register with account number, account name, opening balance and current balance.
- Bank transaction ledger for deposits and withdrawals.
- Transfer/POS sales receipts automatically post deposits to the selected company bank.
- Cleared cheques automatically post a bank deposit and reduce invoice receivables.

## Upgrade an existing v5.0 database
1. Stop the running server (Ctrl+C).
2. Back up the project/database.
3. Replace the application files with v5.1 while preserving your existing `.env`.
4. Run:

   npm install
   npx prisma migrate deploy
   npx prisma generate
   npm run upgrade:v5.1
   npm start

## Important controls
- Do not use `prisma db pull` during the upgrade; it rewrites `schema.prisma` from the current database.
- A HELD or PRESENTED cheque is not payment.
- Only a CLEARED cheque creates a receipt, reduces receivables and posts a bank deposit.
- Bounce and "Do Not Tender / Cancel" do not reduce the customer balance.
- Replacement creates a fresh HELD cheque and links the old cheque as REPLACED.
