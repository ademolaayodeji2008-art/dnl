# DARILTWEENS NIGERIA LIMITED — v5.0 Business Extension

This build preserves the existing Payment Voucher workflow and adds independent business modules around the same authentication, roles, audit log and PostgreSQL database.

## Added modules
- Expanded Dashboard: sales, receivables, invoice aging, cheque statuses, inventory, and existing PV metrics.
- Customers: opening balances, credit limits and customer statements.
- Item Register: KG/CARTON/BAG conversion support, pricing, opening stock and reorder levels.
- Sales Invoices: credit invoices and cash sales.
- Receipts & Partial Payments: CASH, TRANSFER, POS and OTHER settlement methods.
- Receivables: outstanding invoices, pending-cheque cover, uncovered balance and aging buckets.
- Cheque Tracking: HELD -> PRESENTED -> CLEARED / BOUNCED; CANCELLED and REPLACED flows.
- Inventory: stock movement ledger, automatic sale deduction, cancellation stock restoration and stock adjustments.
- Sales Reports: sales, collections, receivables, top customers, top items and stock valuation.
- New role: SALES_PERSON.

## Access design
Sales/Invoice area is available through permissions assigned to SALES_PERSON, ACCOUNT_OFFICER, CEO, ADMIN and SUPER_ADMIN. Sensitive actions such as cheque clearing, invoice cancellation and stock adjustment remain separate permissions.

## Existing database upgrade
1. Back up the database.
2. Run `npm install`.
3. Run `npx prisma generate`.
4. Run `npx prisma migrate deploy`.
5. Run `npm run upgrade:sales`.
6. Run `npm run check`.
7. Start the application.

## Clean/new database
Run migrations, then use the existing clean-client provisioning flow. The seed/setup files include the Sales Person role and new permissions.

## Important control rules
- HELD/PRESENTED cheque does not reduce receivables.
- Only CLEARED cheque creates a sales payment and receipt.
- Credit invoices deduct stock when posted.
- Invoice cancellation is blocked after payment and restores stock when permitted.
- Partial payments update amount paid, outstanding and payment status.
- Financial records are status-driven; transactions are not silently deleted.
