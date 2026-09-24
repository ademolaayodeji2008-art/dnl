# Dariltweens Business System v5.3

## Added
- PV-style Business Reports Centre with report catalogue, date range, preview, print/PDF and Excel export.
- Detailed bank, sales, customer, inventory, stock movement, stock adjustment, inventory issue/write-off, purchase, supplier and cheque reports.
- Purchase Bills Excel sample template, import and export.
- Auditable Inventory Issue / Write-off workflow for PR samples, regulatory/customs issues, expired stock, damaged stock and other authorized issues.
- Inventory issues reduce stock without creating sales revenue. Carrying cost is snapshotted for audit/accounting support.

## Upgrade
```powershell
npm install
npx prisma validate
npx prisma migrate deploy
npx prisma generate
npm run upgrade:v5.3
npm start
```

Do not run `prisma db pull`, `prisma migrate reset`, or `npm audit fix --force` during this upgrade.
