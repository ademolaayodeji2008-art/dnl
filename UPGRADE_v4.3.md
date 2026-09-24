# Payment Voucher Pro v4.3 — Backup, Restore & Branding Finalization

## Branding fix
- Company logo is now saved to both compatible settings stores.
- Settings shows the current logo preview.
- Printable PV resolves the logo to an absolute URL.
- Print waits for the logo to load before opening the print dialog.
- Company name/address/email/phone remain in the PV header.

## Backup & Restore Centre
Admin users with SETTINGS_MANAGE can:
- Create PostgreSQL SQL backups.
- View backup history.
- Download backups.

Restore is restricted to SUPER_ADMIN and requires:
1. Selecting a `.sql` backup.
2. Typing `RESTORE DATABASE` exactly.
3. Accepting a final warning.
4. The server automatically creates a pre-restore safety backup before restoration.
5. Backup/restore actions are written to Audit Trail.

## PostgreSQL tools
The server must be able to run `pg_dump` and `psql`.

On Windows, PostgreSQL normally installs them under a path similar to:
C:\Program Files\PostgreSQL\<version>\bin

Either add that folder to Windows PATH or add this to `.env`:
PG_BIN=C:\Program Files\PostgreSQL\<version>\bin

Do not guess the version: use the PostgreSQL version actually installed on the machine.

## Upgrade
Keep the existing `.env`.

Run:
1. npm install
2. npx prisma format
3. npx prisma generate
4. npx prisma migrate deploy
5. npm start

No new Prisma migration is introduced by v4.3 itself; v4.2 migrations must already be applied.

## Safe acceptance test
1. Settings → confirm logo preview.
2. Print an existing PV and confirm logo + company name.
3. Backup & Restore → Create Backup.
4. Download the generated `.sql`.
5. Confirm normal Staff cannot access Backup & Restore.
6. Confirm non-Super-Admin cannot restore.
7. Do NOT perform the first real restore against the only working database. Test restoration against a disposable/test database before production sign-off.
