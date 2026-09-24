# Dariltweens v5.6 Control Update

No database migration is required.

## New controls
- Unpaid untouched sales invoices can be edited or deleted; deletion restores stock.
- Purchase bills can be edited/deleted only before payment and before later stock activity; reversal recalculates stock/cost.
- Customers can be edited and activated/deactivated while historical transactions remain intact.
- Bank accounts can be edited/deleted only before any transaction/settlement activity; used banks can still be activated/deactivated.

## Upgrade
1. Copy v5.6 files over the existing installation while preserving `.env`, `uploads`, `backups`, and `node_modules`.
2. Run `npm run upgrade:v5.6`.
3. Run `npm start`.
