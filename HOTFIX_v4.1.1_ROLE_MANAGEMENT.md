# v4.1.1 Role Management Hotfix
Adds Manage Roles to User Administration, multi-role assignment/removal, automatic STAFF base role, audit logging of before/after roles, and protection against removing SUPER_ADMIN from the last active Super Admin.

No Prisma migration is required.

Install/upgrade:
npm install
npx prisma generate
npm start
