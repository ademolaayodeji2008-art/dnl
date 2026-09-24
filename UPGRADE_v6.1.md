# DARILTWEENS NIGERIA LIMITED — v6.1 Full Accounting & Financial Reporting

v6.1 expands the v6.0 accounting engine without replacing or resetting existing data.

## Added
- Dedicated Chart of Accounts page
- Dedicated Journal Register
- General Ledger extraction with opening/running/closing balances
- Trial Balance with opening, period debit/credit and closing balances
- Profit & Loss Statement
- Statement of Financial Position / Balance Sheet
- Cash Flow Statement classified into operating, investing and financing activities
- GL transaction extraction/search
- Opening balance posting screen using balanced journals
- Excel and PDF export for accounting reports
- Expanded practical DNL Chart of Accounts
- Accounting-safe negative number display using brackets
- Responsive accounting report layouts

## Database
No Prisma schema migration is required for v6.1. Existing v6.0 ChartAccount, JournalEntry and JournalLine tables remain the accounting foundation.

## Installation after copying files
1. Keep the existing `.env` file.
2. Run `npx prisma generate` only if Prisma Client is not already generated.
3. Run `npm run upgrade:v6.1`.
4. Run `npm run check`.
5. Run `npm start`.
6. Hard refresh the browser with Ctrl+F5.

Do not run `prisma migrate reset` or `prisma db pull`.
