import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prisma=new PrismaClient();
const rl=readline.createInterface({input,output});

const categories=[
  'Airtime','Anniversary','APARTMENT','Bank Charges','Cleaning','Electricity','Entertainment',
  'Expenses','Fuel','HR PROFESSIONAL FEE','Internet','Printing and Stationaries','Professional Fees',
  'Reimbursement Imprest','Repair and Maintenance','REPAYMENT','Salary and Wages','Security','Staff Welfare',
  'Stamp Duty','Subscription','Tax','Tax Clearance Certificate','Training and Development','Traveling',
  'Office Utilities','Welfare','Branding','Marketing','Commission','Transportation',
  'Website Subscription','RENT','ASSET','WAYBILL'
];

const roles=[
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

const permissions=[
  'PV_RAISE','PV_VIEW_OWN','PV_VIEW_ALL','PV_APPROVE','PV_REJECT','PV_PAY',
  'PV_CONFIRM_RECEIPT','EXPENSE_VIEW','REPORT_VIEW','STAFF_MANAGE','USER_MANAGE',
  'APPROVAL_MANAGE','SETTINGS_MANAGE','AUDIT_VIEW','AUDIT_QUERY_CREATE','AUDIT_QUERY_RESPOND','AUDIT_QUERY_RESOLVE','BACKUP_RUN',
  'CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL',
  'SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST',
  'CHEQUE_VIEW','CHEQUE_CREATE','CHEQUE_PRESENT','CHEQUE_CLEAR','CHEQUE_BOUNCE','CHEQUE_CANCEL','CHEQUE_REPLACE','SALES_REPORT_VIEW',
  'SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'
];

const roleMap={
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

function strongPassword(p){
  return String(p||'').length>=10 &&
    /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
}
function generatedPassword(){
  const U='ABCDEFGHJKLMNPQRSTUVWXYZ',L='abcdefghijkmnopqrstuvwxyz',N='23456789',S='!@#$%&*?';
  const A=U+L+N+S,pick=s=>s[crypto.randomInt(0,s.length)];
  let chars=[pick(U),pick(L),pick(N),pick(S)];
  while(chars.length<12)chars.push(pick(A));
  for(let i=chars.length-1;i>0;i--){const j=crypto.randomInt(0,i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
  return chars.join('');
}
async function ask(label,def=''){
  const hint=def?` [${def}]`:'';
  const v=(await rl.question(`${label}${hint}: `)).trim();
  return v||def;
}
async function operationalCounts(){
  const [
    staff,users,vouchers,items,approvals,payments,expenses,attachments,notifications,audits,workflows
  ]=await Promise.all([
    prisma.staff.count(),prisma.user.count(),prisma.voucher.count(),prisma.voucherItem.count(),
    prisma.approval.count(),prisma.payment.count(),prisma.expense.count(),
    prisma.voucherAttachment.count(),prisma.notification.count(),prisma.auditLog.count(),
    prisma.approvalWorkflow.count()
  ]);
  return {staff,users,vouchers,items,approvals,payments,expenses,attachments,notifications,audits,workflows};
}
function hasClientData(c){return Object.values(c).some(n=>Number(n)>0)}

async function main(){
  console.log('\n==============================================');
  console.log(' PAYMENT VOUCHER PRO — CLEAN CLIENT SETUP');
  console.log('==============================================\n');

  const counts=await operationalCounts();
  if(hasClientData(counts)){
    console.error('SETUP ABORTED: This database is not blank.');
    console.error('Existing records:',counts);
    console.error('\nUse a brand-new client database. This installer will never wipe an existing database.');
    process.exitCode=2; return;
  }

  const companyName=await ask('Company Name','Dariltweens Nigeria Limited');
  if(!companyName) throw new Error('Company Name is required.');
  const companyCode=(await ask('Company Code',companyName==='Dariltweens Nigeria Limited'?'DARILTWEENS':(companyName.replace(/[^A-Za-z0-9]/g,'').slice(0,10).toUpperCase()||'COMP'))).toUpperCase();
  const currency=(await ask('Currency','NGN')).toUpperCase();
  const timezone=await ask('Timezone','Africa/Lagos');
  const pvPrefix=(await ask('PV Prefix','PV')).toUpperCase();

  console.log('\nFirst Super Admin');
  const firstName=await ask('First Name');
  const lastName=await ask('Last Name');
  const email=(await ask('Email')).toLowerCase();
  if(!email||!email.includes('@')) throw new Error('A valid Super Admin email is required.');

  const custom=await ask('Temporary Password (press Enter to auto-generate)','');
  const temporaryPassword=custom||generatedPassword();
  if(!strongPassword(temporaryPassword)){
    throw new Error('Temporary password must be 10+ characters and contain uppercase, lowercase, number and special character.');
  }

  console.log('\n----------------------------------------------');
  console.log(`Company: ${companyName}`);
  console.log(`Code: ${companyCode}`);
  console.log(`Currency: ${currency}`);
  console.log(`PV Prefix: ${pvPrefix}`);
  console.log(`Super Admin: ${firstName} ${lastName} <${email}>`);
  console.log('----------------------------------------------');
  const confirm=(await ask('Type INSTALL to create this clean client','')).toUpperCase();
  if(confirm!=='INSTALL'){console.log('Setup cancelled.');return;}

  // System roles and permissions.
  for(const [code,name] of roles){
    await prisma.role.upsert({where:{code},update:{name,active:true},create:{code,name,active:true}});
  }
  for(const code of permissions){
    await prisma.permission.upsert({
      where:{code},update:{description:code.replaceAll('_',' ')},
      create:{code,description:code.replaceAll('_',' ')}
    });
  }

  const allRoles=await prisma.role.findMany();
  const allPerms=await prisma.permission.findMany();
  for(const role of allRoles){
    const wanted=roleMap[role.code]||[];
    for(const perm of allPerms){
      const allowed=wanted.includes('*')||wanted.includes(perm.code);
      await prisma.rolePermission.upsert({
        where:{roleId_permissionId:{roleId:role.id,permissionId:perm.id}},
        update:{allowed},
        create:{roleId:role.id,permissionId:perm.id,allowed}
      });
    }
  }

  // Standard categories (master data, not client transactions).
  for(const name of categories){
    const code=name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    await prisma.expenseCategory.upsert({
      where:{code},update:{name,active:true},create:{code,name,active:true}
    });
  }

  // Blank PV sequence.
  await prisma.sequence.upsert({
    where:{code:'PV'},
    update:{prefix:pvPrefix,lastNo:0,year:new Date().getFullYear(),padLength:6},
    create:{code:'PV',prefix:pvPrefix,lastNo:0,year:new Date().getFullYear(),padLength:6}
  });

  const defaults={
    APP_NAME:'Dariltweens Nigeria Limited Business & Payment Control System',
    COMPANY_NAME:companyName,
    COMPANY_CODE:companyCode,
    CURRENCY:currency,
    TIMEZONE:timezone,
    PV_PREFIX:pvPrefix,
    ALLOW_SELF_APPROVAL:'FALSE',
    REQUIRE_SUPPORTING_DOCUMENT:'FALSE',
    REQUIRE_PAYMENT_EVIDENCE:'FALSE',
    REQUIRE_EMAIL_VERIFICATION:'FALSE',
    EMAIL_NOTIFICATIONS_ENABLED:'FALSE'
  };
  for(const [key,value] of Object.entries(defaults)){
    await prisma.setting.upsert({where:{key},update:{value},create:{key,value}});
  }
  for(const [key,value] of Object.entries({
    COMPANY_NAME:companyName,CURRENCY:currency,TIMEZONE:timezone,PV_PREFIX:pvPrefix
  })){
    await prisma.companySetting.upsert({where:{key},update:{value},create:{key,value}});
  }

  const passwordHash=await bcrypt.hash(temporaryPassword,12);
  const admin=await prisma.user.create({
    data:{
      firstName:firstName||'System',
      lastName:lastName||'Administrator',
      email,passwordHash,status:'ACTIVE',emailVerifiedAt:new Date(),
      mustChangePassword:true,passwordChangedAt:new Date()
    }
  });
  const superRole=await prisma.role.findUnique({where:{code:'SUPER_ADMIN'}});
  await prisma.userRole.create({data:{userId:admin.id,roleId:superRole.id,active:true}});

  const final=await operationalCounts();

  console.log('\n==============================================');
  console.log(' CLEAN CLIENT INSTALLATION COMPLETE');
  console.log('==============================================');
  console.log(`Company: ${companyName}`);
  console.log(`Super Admin: ${email}`);
  console.log(`Temporary Password: ${temporaryPassword}`);
  console.log('\nIMPORTANT: Give the temporary password securely.');
  console.log('The Super Admin MUST change it immediately after first sign-in.');
  console.log('\nBlank operational status:');
  console.log(`PV: ${final.vouchers}`);
  console.log(`Payments: ${final.payments}`);
  console.log(`Approvals: ${final.approvals}`);
  console.log(`Expenses: ${final.expenses}`);
  console.log(`Attachments: ${final.attachments}`);
  console.log(`Staff: ${final.staff}`);
  console.log('==============================================\n');
}

main()
  .catch(e=>{console.error('\nSetup failed:',e.message);process.exitCode=1})
  .finally(async()=>{rl.close();await prisma.$disconnect()});
