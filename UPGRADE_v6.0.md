# DARILTWEENS NIGERIA LIMITED — v6.0 Accounting & Control Suite

## Scope
v6.0 adds the pre-full-test accounting and control layer without replacing the existing Payment Voucher workflow.

### New control modules
- Management Control Centre with daily sales, collections, purchases, supplier payments, expenses, bank balance, stock value, low-stock alerts, overdue receivables/payables, PV pending and audit exceptions.
- Customer credit limits, credit days and credit hold/override controls.
- Supplier credit days and payable ageing.
- Receivables and payables ageing buckets.
- Accounting periods, month-end checklist, close/reopen controls and closed-period transaction blocking.
- Document numbering / sequence configuration.
- Configurable high-value purchase/payment control thresholds.
- Audit Exception Dashboard with scans for high discounts, high-value sales, backdated invoices, manual bank entries and material stock adjustments.
- Security & Sessions Centre, configurable login lockout and password-expiry controls.

### Accounting
- Chart of Accounts.
- Manual journals and journal reversal.
- General Ledger.
- Trial Balance.
- Profit & Loss and Balance Sheet snapshot.
- Idempotent operational-to-GL synchronization for sales invoices, customer payments, purchase bills, supplier payments and PV expenses.

### Banking
- Bank reconciliation register.
- Statement-line entry/paste.
- Auto matching by amount/date/reference.
- Manual match, explicit exclusion and completion control.

### Inventory
- Batch / lot register by cold room/location.
- Manufacture and expiry dates.
- Expiry alerts and batch status controls.
- Reorder-level monitoring in the Control Centre.

### Planning
- GL-based budgets and Budget vs Actual variance reporting.

## Safe upgrade sequence
1. Stop the server.
2. Back up the complete current project folder and database.
3. Copy v6.0 files over the current project while excluding `.env`.
4. Run `npx prisma validate`.
5. Run `npx prisma migrate status`.
6. Run `npx prisma migrate deploy`.
7. Run `npx prisma generate`.
8. Run `npm run upgrade:v6.0`.
9. Run `npm run check`.
10. Start with `npm start` and hard-refresh the browser.

## Safety
Do not run `prisma migrate reset` or `prisma db pull` during this upgrade. The migration is additive and preserves existing Payment Voucher, sales, banking, inventory, purchasing, returns, location and audit data.

## Notes
- Untouched invoices/bills retain the existing restricted pre-activity delete controls. Posted accounting corrections are handled by journal reversal rather than deleting the accounting trail.
- Batch tracking is optional and allocates existing physical location stock to traceable batches. Existing stock can continue operating without batch allocation.
- The operational-to-GL sync is idempotent: records already linked to journals are skipped.
