# Payment Voucher Pro v2.1 — Approval Setup Upgrade

## What changed
- Shows every authorized approver directly under each approval level.
- Shows approver name, email and assigned role(s).
- Multiple users can be authorized on the same level.
- Duplicate approvers are excluded from the Add Approver list.
- Remove Approver.
- Edit workflow.
- Activate/deactivate workflow.
- Edit approval level.
- Activate/deactivate approval level.
- Clearer ANY/ALL and minimum-approval display.
- Existing pending vouchers use the live authorization table, so a newly authorized Account Officer can see the pending PV immediately after refresh/login.

## Replace/update your project
This ZIP intentionally excludes `node_modules` and your private `.env`.

1. Back up your current project.
2. Copy the v2.1 files over the existing project, keeping your existing `.env`.
3. In the VS Code terminal, inside the project folder, run:

   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm start

## Configure your current workflow
Open Approval Setup:
- General Payment Approval
- Level 1: Account Officer / CEO
- Mode: ANY
- Minimum approvals: 1

Under Authorized Approvers, add BOTH:
- CEO
- Account Officer

You should visibly see both names before testing.

Then refresh/login as Account Officer. The existing PENDING_APPROVAL voucher should appear without raising another voucher.
