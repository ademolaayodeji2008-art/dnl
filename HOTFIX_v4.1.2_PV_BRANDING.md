# v4.1.2 PV Branding Hotfix

Fixes the printable Payment Voucher header so it reads branding from the same Settings table used by the Admin Settings page.

Also adds editable Company Address, Company Phone and Company Email fields to Settings.

The printable PV header now displays:
- Company logo (when configured)
- Company name
- Company address
- Company email and phone
- PAYMENT VOUCHER title, PV number and status

No Prisma migration is required.

Upgrade:
1. Keep the existing `.env`.
2. npm install
3. npx prisma generate
4. npm start
5. Settings → enter/save company identity details.
6. Open an existing PV → Print / Save PDF and verify the header.
