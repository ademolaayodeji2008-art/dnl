# Dariltweens v5.9 — Internal Auditor & Audit Centre

Includes all v5.6, v5.7 and v5.8 features plus an Internal Auditor role, Audit Centre, audit query/response/resolution workflow, and collision-safe responsive cards/dialogs.

## Upgrade directly from installed v5.5
1. Back up the current application folder/database.
2. Copy v5.9 files over the app while preserving `.env`, `node_modules`, `uploads`, and `backups`.
3. Restore the existing `20260906180000_add_database_backup` migration folder if it is absent from the package copy.
4. Run `npx prisma validate`.
5. Run `npx prisma migrate status`.
6. Run `npx prisma migrate deploy` to apply returns/refunds, multi-location inventory, and Audit Centre migrations.
7. Run `npx prisma generate`.
8. Run `npm run upgrade:v5.6`, `npm run upgrade:v5.7`, `npm run upgrade:v5.8`, and `npm run upgrade:v5.9`.
9. Start with `npm start`.

## Internal Auditor control
Internal Auditor is intentionally read-only for operational transactions. It can inspect PV, sales, purchases, banking, inventory, cold rooms, returns/refunds and all business reports, and can raise/resolve audit queries. Management roles can respond to queries.

## UI collision protection
Cards, forms, tables and dialogs use constrained widths, responsive grids, wrapped toolbars, safe overflow and internal scrolling so one card cannot cover another card's information on desktop, tablet or mobile layouts.
