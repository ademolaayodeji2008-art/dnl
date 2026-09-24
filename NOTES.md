# DNL Deployment Notes

## Project
- App: Dariltweens Nigeria Limited Business & Payment Control System
- GitHub: https://github.com/ademolaayodeji2008-art/dnl.git
- Working folder: C:\Users\USER\Desktop\payment-voucher-pro-v4.4

## VPS (Bluehost)
- IP: 129.121.142.57
- OS: Ubuntu 24.04
- App folder: /var/www/dnl
- Process manager: PM2 (app name: dnl)
- Database: PostgreSQL
  - DB name: payment_voucher_db
  - DB user: pvpro_user
  - Port: 5432

## App URL
http://129.121.142.57:3000

## Admin Login
- Email: admin@dariltweens.com
- Password: Admin@2026!
- Role: SUPER_ADMIN

## .env Keys needed on VPS
- PORT=3000
- NODE_ENV=production
- DATABASE_URL=postgresql://pvpro_user:<password>@localhost:5432/payment_voucher_db
- JWT_SECRET=<long random string>
- INITIAL_ADMIN_EMAIL=admin@dariltweens.com
- INITIAL_ADMIN_PASSWORD=Admin@2026!
- SMTP_HOST=mail.antherconsulting.com.ng
- SMTP_PORT=587
- SMTP_USER=info2@antherconsulting.com.ng
- APP_URL=http://129.121.142.57:3000

## Deploy update to VPS
SSH into VPS then run:
```
cd /var/www/dnl && git fetch origin && git reset --hard origin/main && npm install && npx prisma migrate deploy && pm2 restart dnl
```

## Push changes from this PC to GitHub
```
cd "C:\Users\USER\Desktop\payment-voucher-pro-v4.4"
git add .
git commit -m "your message"
git push
```

## Re-run seed (create admin user)
On VPS:
```
cd /var/www/dnl && node prisma/seed.js
```
Make sure INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are in /var/www/dnl/.env first.

## SSH into VPS
```
ssh root@129.121.142.57
```

## PM2 commands
```
pm2 status          # check app status
pm2 restart dnl     # restart app
pm2 logs dnl        # view logs
```
