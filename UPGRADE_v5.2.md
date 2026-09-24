# Dariltweens Nigeria Limited Business System v5.2

## Added in v5.2
- Full-screen New Invoice workspace.
- Invoice Excel import/export plus downloadable sample template.
- Customer Excel import/export plus downloadable sample template.
- Item Excel import/export plus downloadable sample template.
- Stock Adjustment now exposes Adjustment Date in the UI and posts that date to the stock movement ledger.
- Purchase Bills / Goods Received module with suppliers, purchase lines, inventory receipt, supplier payable and supplier payment from company bank.
- New roles: `INVENTORY_OFFICER` and `VISITOR`.
- Inventory Officer can maintain items, inventory, stock adjustments, suppliers and purchase bills, but does not receive banking/payment permissions by default.
- Visitor receives `PV_VIEW_ALL` only and cannot raise/edit/approve/pay a PV.
- Admin, CEO and Account Officer receive PV raise/view access while existing approval/payment permissions remain separate to preserve internal controls.
- Bank-to-bank transfer with matched `TRANSFER_OUT` and `TRANSFER_IN` ledger entries.
- Business Reports Centre: bank transactions, sales detail, customer balances, inventory valuation, purchases, supplier payables and cheque register; each report can export to Excel.

## Accounting treatment used
v5.2 strengthens subledger control rather than pretending to be a complete statutory general ledger:
- Sales invoices increase customer receivables and reduce inventory through stock movement records.
- Cleared customer payments reduce receivables; transfer/POS/cleared-cheque receipts update the selected company bank.
- Purchase bills increase inventory and supplier payables; they are not treated as an immediate cash expense.
- Supplier payments reduce the selected bank and the purchase-bill payable.
- Bank transfers reduce one bank and increase another by the same amount, without creating income or expense.
- PDCs remain non-cash until cleared.

This treatment is accounting-aligned, but statutory financial statements still require the full chart-of-accounts/general-ledger layer if the system is to become the sole accounting book of record.

## Safe upgrade from v5.1
Do not use `prisma db pull` and do not use `prisma migrate reset`.

```powershell
npm install
npx prisma validate
npx prisma migrate deploy
npx prisma generate
npm run upgrade:v5.2
npm start
```

Migration added:
`20260913103000_purchasing_imports_reporting`
