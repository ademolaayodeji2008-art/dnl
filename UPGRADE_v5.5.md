# Dariltweens Business System v5.5

No database schema migration is required for v5.5.

## What changed
- Sales Person role is presented as **Sales Officer**.
- Sales Officer receives the full sales working permissions needed for customers, invoices, payments, receipts, receivables, customer statements, cheque registration/tracking, Sales Reports, and Business Reports.
- Business Reports are filtered server-side by role:
  - Sales Officer: Sales reports only.
  - Inventory Officer: Inventory reports only.
  - Account Officer, CEO, Admin and Super Admin keep broader report access.
- Excel Business Report export fixed by routing `.xlsx` requests before the generic report endpoint.
- Added a dedicated Supplier master page with supplier creation, list, payable position, edit and activate/inactivate controls.
- Native browser `prompt`, `confirm`, and `alert` dialogs replaced with responsive Dariltweens in-app cards.
- Added card/layout collision protection for small screens and dense forms.

## Existing client upgrade
After copying v5.5 files over v5.4 while preserving `.env`, run:

```powershell
npm run upgrade:v5.5
npm run check
npm start
```

No `prisma migrate reset`, `prisma db pull`, or new migration is required.
