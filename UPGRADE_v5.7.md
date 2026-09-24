# Dariltweens v5.7 — Returns, Credit/Debit Notes & Refunds

## New controls
- Customer returns reference the original invoice and cannot exceed the unreturned original quantity.
- Credit-note value is derived proportionally from the original invoice line.
- Resalable customer returns increase available stock; damaged/expired/other conditions remain documented but do not inflate saleable stock.
- Credit notes first reduce the invoice receivable; any excess becomes a customer refund due.
- Customer refunds post a bank withdrawal and appear on the customer statement.
- Supplier returns reference the original purchase bill, cannot exceed the unreturned purchase quantity, and require enough stock on hand.
- Debit notes first reduce supplier payable; excess becomes a supplier refund due.
- Supplier refunds post a bank deposit and appear on the supplier statement.
- Original invoices and purchase bills remain intact for audit history.
- Business Reports include sales returns, customer refunds, net sales, purchase returns, supplier refunds, net purchases, and return stock movements.

## Upgrade
1. Back up the current project/database.
2. Copy v5.7 over the current application, preserving `.env`, uploads and backups.
3. `npx prisma validate`
4. `npx prisma migrate status`
5. `npx prisma migrate deploy`
6. `npx prisma generate`
7. `npm run upgrade:v5.7`
8. `npm start`

Never use `prisma migrate reset` or `prisma db pull` on the live database.
