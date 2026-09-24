# Dariltweens v5.8 — Multi-Location / Cold Room Inventory

Adds active/inactive inventory items, cold room/location masters, location stock balances, pickup-location selection during sales, stock transfers, location-aware stock adjustments, and location reporting.

## Upgrade
1. Back up the current application/database.
2. Copy v5.8 files over the existing app while preserving `.env`, `uploads`, `backups`, and `node_modules`.
3. `npx prisma validate`
4. `npx prisma migrate deploy`
5. `npx prisma generate`
6. If upgrading directly from v5.5, run `npm run upgrade:v5.6`, `npm run upgrade:v5.7`, then `npm run upgrade:v5.8`.
7. `npm start`

Existing pre-v5.8 stock is preserved under **Main / Unallocated Cold Room**. Create the real cold rooms and transfer stock from Main to the correct physical locations. Do not use stock adjustments merely to relocate stock.
