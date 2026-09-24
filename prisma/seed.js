import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const categories = [
  'Airtime','Anniversary','APARTMENT','Bank Charges','Cleaning','Electricity','Entertainment',
  'Expenses','Fuel','HR PROFESSIONAL FEE','Internet','Printing and Stationaries','Professional Fees',
  'Reimbursement Imprest','Repair and Maintenance','REPAYMENT','Salary and Wages','Security','Staff Welfare',
  'Stamp Duty','Subscription','Tax','Tax Clearance Certificate','Training and Development','Traveling',
  'Office Utilities','Welfare','Branding','Marketing','Commission','Transportation',
  'Website Subscription','RENT','ASSET','WAYBILL'
];

const roles = [
  ['STAFF','Staff'],
  ['ACCOUNT_OFFICER','Account Officer'],
  ['SALES_PERSON','Sales Officer'],
  ['INVENTORY_OFFICER','Inventory Officer'],
  ['VISITOR','Visitor'],
  ['INTERNAL_AUDITOR','Internal Auditor'],
  ['CEO','CEO'],
  ['PAYABLE_OFFICER','Payable Officer'],
  ['FINANCE_MANAGER','Finance Manager'],
  ['ADMIN','Administrator'],
  ['SUPER_ADMIN','Super Administrator']
];

const permissions = [
  'PV_RAISE','PV_VIEW_OWN','PV_VIEW_ALL','PV_APPROVE','PV_REJECT','PV_PAY',
  'PV_CONFIRM_RECEIPT','EXPENSE_VIEW','REPORT_VIEW','STAFF_MANAGE','USER_MANAGE',
  'APPROVAL_MANAGE','SETTINGS_MANAGE','AUDIT_VIEW','AUDIT_QUERY_CREATE','AUDIT_QUERY_RESPOND','AUDIT_QUERY_RESOLVE','BACKUP_RUN',
  'CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL',
  'SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST',
  'CHEQUE_VIEW','CHEQUE_CREATE','CHEQUE_PRESENT','CHEQUE_CLEAR','CHEQUE_BOUNCE','CHEQUE_CANCEL','CHEQUE_REPLACE','SALES_REPORT_VIEW',
  'SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'
];

const roleMap = {
  STAFF:['PV_RAISE','PV_VIEW_OWN','PV_CONFIRM_RECEIPT'],
  ACCOUNT_OFFICER:['PV_RAISE','PV_VIEW_ALL','PV_APPROVE','PV_REJECT','REPORT_VIEW','EXPENSE_VIEW','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL','SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST','CHEQUE_VIEW','CHEQUE_CREATE','CHEQUE_PRESENT','CHEQUE_CLEAR','CHEQUE_BOUNCE','CHEQUE_CANCEL','CHEQUE_REPLACE','SALES_REPORT_VIEW',
  'SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'],
  SALES_PERSON:['CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL','SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','CHEQUE_VIEW','CHEQUE_CREATE','SALES_REPORT_VIEW','BUSINESS_REPORT_VIEW'],
  INVENTORY_OFFICER:['ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST','SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','PURCHASE_VIEW','PURCHASE_CREATE'],
  INTERNAL_AUDITOR:['PV_VIEW_ALL','EXPENSE_VIEW','REPORT_VIEW','CUSTOMER_VIEW','INVOICE_VIEW','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','INVENTORY_VIEW','CHEQUE_VIEW','SALES_REPORT_VIEW','SUPPLIER_VIEW','PURCHASE_VIEW','BUSINESS_REPORT_VIEW','AUDIT_VIEW','AUDIT_QUERY_CREATE','AUDIT_QUERY_RESOLVE'],
  VISITOR:['PV_VIEW_ALL'],
  CEO:['PV_RAISE','PV_VIEW_ALL','PV_APPROVE','PV_REJECT','REPORT_VIEW','EXPENSE_VIEW','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL','SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST','CHEQUE_VIEW','CHEQUE_CREATE','CHEQUE_PRESENT','CHEQUE_CLEAR','CHEQUE_BOUNCE','CHEQUE_CANCEL','CHEQUE_REPLACE','SALES_REPORT_VIEW',
  'SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'],
  PAYABLE_OFFICER:['PV_VIEW_ALL','PV_PAY','EXPENSE_VIEW','REPORT_VIEW'],
  FINANCE_MANAGER:['PV_VIEW_ALL','EXPENSE_VIEW','REPORT_VIEW'],
  ADMIN:['PV_RAISE','PV_VIEW_ALL','EXPENSE_VIEW','REPORT_VIEW','STAFF_MANAGE','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL','SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST','CHEQUE_VIEW','CHEQUE_CREATE','CHEQUE_PRESENT','CHEQUE_CLEAR','CHEQUE_BOUNCE','CHEQUE_CANCEL','CHEQUE_REPLACE','SALES_REPORT_VIEW',
  'SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'],
  SUPER_ADMIN:['*']
};

for (const [code,name] of roles) {
  await prisma.role.upsert({where:{code}, update:{name,active:true}, create:{code,name,active:true}});
}
for (const code of permissions) {
  await prisma.permission.upsert({where:{code},update:{},create:{code,description:code.replaceAll('_',' ')}});
}
const allRoles = await prisma.role.findMany();
const allPerms = await prisma.permission.findMany();
for (const role of allRoles) {
  const wanted = roleMap[role.code] || [];
  for (const perm of allPerms) {
    if (wanted.includes('*') || wanted.includes(perm.code)) {
      await prisma.rolePermission.upsert({
        where:{roleId_permissionId:{roleId:role.id,permissionId:perm.id}},
        update:{allowed:true},
        create:{roleId:role.id,permissionId:perm.id,allowed:true}
      });
    }
  }
}

for (const name of categories) {
  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  await prisma.expenseCategory.upsert({where:{code}, update:{name,active:true}, create:{code,name,active:true}});
}

await prisma.sequence.upsert({
  where:{code:'PV'},
  update:{},
  create:{code:'PV',prefix:'PV',lastNo:0,year:new Date().getFullYear(),padLength:6}
});

const defaults = {
  APP_NAME:'Dariltweens Nigeria Limited Business & Payment Control System',
  COMPANY_NAME:'Dariltweens Nigeria Limited',
  COMPANY_CODE:'DARILTWEENS',
  CURRENCY:'NGN',
  ALLOW_SELF_APPROVAL:'FALSE',
  EMAIL_NOTIFICATIONS_ENABLED:'FALSE'
};
for (const [key,value] of Object.entries(defaults)) {
  await prisma.setting.upsert({where:{key},update:{},create:{key,value}});
}

if (process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
  const email = process.env.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
  const hash = await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where:{email},
    update:{},
    create:{
      firstName:process.env.INITIAL_ADMIN_FIRST_NAME || 'System',
      lastName:process.env.INITIAL_ADMIN_LAST_NAME || 'Administrator',
      email,
      passwordHash:hash
    }
  });
  const superRole = await prisma.role.findUnique({where:{code:'SUPER_ADMIN'}});
  await prisma.userRole.upsert({
    where:{userId_roleId:{userId:admin.id,roleId:superRole.id}},
    update:{active:true},
    create:{userId:admin.id,roleId:superRole.id,active:true}
  });
}

console.log('Seed complete.');
await prisma.$disconnect();
