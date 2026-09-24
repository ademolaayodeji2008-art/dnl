# Dariltweens Nigeria Limited Business System v5.4

## Improvements
- Company acronym/logo changed from DN/DA to **DNL**.
- Desktop sidebar is fixed to the viewport; only the navigation menu scrolls beneath the fixed DNL header, while sign-out remains available at the bottom.
- Detailed customer invoice PDF output.
- Customer statement PDF output with running balance and cheque history.
- Print/download sizes: A4, A5, 80mm POS and 58mm POS.
- POS output uses a compact receipt layout rather than a scaled-down A4 document.
- v5.3 inventory issue/write-off and expanded report features remain included.

## Upgrade
Run the normal safe upgrade sequence after overlaying the release while preserving `.env`:

```powershell
npm install
npx prisma validate
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm run upgrade:v5.2
npm run upgrade:v5.3
npm start
```

No new database migration is required specifically for v5.4 print/layout changes.
