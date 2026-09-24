# Payment Voucher Pro v4.3.1 — Mobile Responsive UI

No database changes.

## Added
- Mobile/tablet hamburger navigation.
- Sidebar hidden by default on screens 900px and below.
- Slide-in sidebar with dark overlay.
- Tap outside, select a menu item, or press Escape to close.
- Body scrolling is locked while the mobile menu is open.
- Responsive dashboard cards, forms, PV details, approvals, reports, Settings and Backup/Restore.
- Wide tables use horizontal touch scrolling instead of breaking the page.
- Mobile-friendly login/registration and forced password-change screens.
- Smaller header controls and hidden username on narrow screens to preserve space.
- Desktop layout remains unchanged.
- Print/PDF rules remain independent from mobile navigation.

## Upgrade
Keep existing `.env`.
1. npm install
2. npx prisma format
3. npx prisma generate
4. npx prisma migrate deploy
5. npm start

## Mobile acceptance test
Open the app from a phone on the same network using the computer's LAN IP and port 3000, not localhost.
Test:
- Login/register
- hamburger open/close
- Dashboard
- New PV
- Pending Approval
- View Details
- Approve/Reject
- Payment/settlement and evidence
- Reports
- Settings (Admin)
- Backup & Restore (Admin)
- Logout

If Windows Firewall prompts for Node.js network access, allow Private networks only for local testing.
