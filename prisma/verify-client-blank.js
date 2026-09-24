import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const c={
  staff:await prisma.staff.count(),
  vouchers:await prisma.voucher.count(),
  approvals:await prisma.approval.count(),
  payments:await prisma.payment.count(),
  expenses:await prisma.expense.count(),
  attachments:await prisma.voucherAttachment.count()
};
console.table(c);
const bad=Object.values(c).some(x=>x!==0);
console.log(bad?'NOT BLANK — do not use as a new client database.':'CLEAN — no operational client data found.');
await prisma.$disconnect();
process.exitCode=bad?2:0;
