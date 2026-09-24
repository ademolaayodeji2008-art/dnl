# v4.2 Identity & Password Security

Adds strong passwords, optional staff email verification, forced first-login password change for Admin-created/reset users, secure reset/verification tokens, password-strength indicators, old-session invalidation after password changes, resend/reset rate limiting, and audit events.

Email verification is controlled in Settings and requires transactional SMTP only when enabled. Workflow email notifications remain optional.

Upgrade:
npm install
npx prisma format
npx prisma generate
npx prisma migrate deploy
npm start

Acceptance:
1. Weak registration password rejected.
2. Strong registration password accepted.
3. Admin-created user cannot use app until changing temporary password.
4. Admin reset forces change again.
5. Old token invalid after password change.
6. Test email verification only when SMTP is configured and the setting is enabled.
