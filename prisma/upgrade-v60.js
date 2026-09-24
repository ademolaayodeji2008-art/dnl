import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();

const permissions=[
  'CONTROL_CENTRE_VIEW','AGEING_VIEW',
  'ACCOUNTING_VIEW','ACCOUNTING_MANAGE','JOURNAL_CREATE','JOURNAL_REVERSE','ACCOUNTING_SYNC',
  'PERIOD_VIEW','PERIOD_MANAGE','PERIOD_CLOSE','PERIOD_REOPEN','SEQUENCE_MANAGE',
  'BANK_RECON_VIEW','BANK_RECON_CREATE','BANK_RECON_MANAGE','BANK_RECON_COMPLETE',
  'BUDGET_VIEW','BUDGET_MANAGE','BATCH_VIEW','BATCH_MANAGE',
  'AUDIT_EXCEPTION_VIEW','AUDIT_EXCEPTION_SCAN','AUDIT_EXCEPTION_MANAGE',
  'CONTROL_SETTINGS_MANAGE','SESSION_MANAGE','CONTROL_APPROVE','CREDIT_OVERRIDE'
];
const charts=[
  ['1000','Cash and Bank','ASSET','BANK','OPERATING'],
  ['1100','Accounts Receivable','ASSET','AR','OPERATING'],
  ['1200','Inventory','ASSET','INVENTORY','OPERATING'],
  ['1300','VAT Input','ASSET','VAT_INPUT','OPERATING'],
  ['2000','Accounts Payable','LIABILITY','AP','OPERATING'],
  ['2100','VAT Output','LIABILITY','VAT_OUTPUT','OPERATING'],
  ['2200','Suspense / Clearing','LIABILITY','SUSPENSE','OPERATING'],
  ['3000','Owner Equity / Retained Earnings','EQUITY','EQUITY','FINANCING'],
  ['4000','Sales Revenue','REVENUE','SALES','OPERATING'],
  ['4100','Sales Returns and Allowances','REVENUE','SALES_RETURNS','OPERATING'],
  ['5000','Cost of Goods Sold','EXPENSE','COGS','OPERATING'],
  ['6000','Operating Expenses','EXPENSE','OPEX','OPERATING'],
  ['6100','Inventory Write-off / Adjustment','EXPENSE','STOCK_ADJUSTMENT','OPERATING'],
  ['6200','Bank Charges','EXPENSE','BANK_CHARGES','OPERATING']
];
const defaults={
  PASSWORD_EXPIRY_DAYS:'90',LOGIN_MAX_ATTEMPTS:'5',LOCKOUT_MINUTES:'15',BACKDATE_EXCEPTION_DAYS:'7',
  DISCOUNT_EXCEPTION_PERCENT:'10',HIGH_VALUE_EXCEPTION_AMOUNT:'1000000',PURCHASE_APPROVAL_THRESHOLD:'1000000',
  PAYMENT_APPROVAL_THRESHOLD:'500000',EXPIRY_ALERT_DAYS:'60'
};
async function grant(roleCode,codes){const role=await prisma.role.findUnique({where:{code:roleCode}});if(!role)return;const ps=await prisma.permission.findMany({where:{code:{in:codes}}});for(const p of ps)await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}})}
async function main(){
  for(const code of permissions)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  await grant('SUPER_ADMIN',permissions);
  await grant('CEO',permissions.filter(x=>!['ACCOUNTING_MANAGE','SEQUENCE_MANAGE','CONTROL_SETTINGS_MANAGE'].includes(x)));
  await grant('FINANCE_MANAGER',['CONTROL_CENTRE_VIEW','AGEING_VIEW','ACCOUNTING_VIEW','JOURNAL_CREATE','JOURNAL_REVERSE','ACCOUNTING_SYNC','PERIOD_VIEW','PERIOD_MANAGE','PERIOD_CLOSE','BANK_RECON_VIEW','BANK_RECON_CREATE','BANK_RECON_MANAGE','BANK_RECON_COMPLETE','BUDGET_VIEW','BUDGET_MANAGE','BATCH_VIEW','AUDIT_EXCEPTION_VIEW','AUDIT_EXCEPTION_SCAN','AUDIT_EXCEPTION_MANAGE','CONTROL_APPROVE','CREDIT_OVERRIDE']);
  await grant('ACCOUNT_OFFICER',['CONTROL_CENTRE_VIEW','AGEING_VIEW','ACCOUNTING_VIEW','JOURNAL_CREATE','PERIOD_VIEW','BANK_RECON_VIEW','BANK_RECON_CREATE','BANK_RECON_MANAGE','BUDGET_VIEW','BATCH_VIEW','AUDIT_EXCEPTION_VIEW']);
  await grant('INTERNAL_AUDITOR',['CONTROL_CENTRE_VIEW','AGEING_VIEW','ACCOUNTING_VIEW','PERIOD_VIEW','BANK_RECON_VIEW','BUDGET_VIEW','BATCH_VIEW','AUDIT_EXCEPTION_VIEW','AUDIT_EXCEPTION_SCAN']);
  await grant('SALES_OFFICER',['CONTROL_CENTRE_VIEW','AGEING_VIEW','BATCH_VIEW']);
  await grant('INVENTORY_OFFICER',['CONTROL_CENTRE_VIEW','BATCH_VIEW','BATCH_MANAGE']);
  await grant('PAYABLE_OFFICER',['CONTROL_CENTRE_VIEW','AGEING_VIEW','BANK_RECON_VIEW']);
  for(const [accountCode,name,type,systemCode,cashFlowGroup] of charts)await prisma.chartAccount.upsert({where:{accountCode},update:{name,type,systemCode,cashFlowGroup,active:true},create:{accountCode,name,type,systemCode,cashFlowGroup,active:true,allowPosting:true}});
  for(const [key,value] of Object.entries(defaults))await prisma.setting.upsert({where:{key},update:{},create:{key,value,description:'Dariltweens v6.0 control default'}});
  const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1),end=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999),name=start.toLocaleString('en-GB',{month:'long',year:'numeric'});
  const overlap=await prisma.accountingPeriod.findFirst({where:{startDate:{lte:end},endDate:{gte:start}}});
  if(!overlap){const items=[['BANK_RECON','Complete bank reconciliation'],['RECEIVABLES','Review receivables and ageing'],['PAYABLES','Review supplier payables and ageing'],['STOCK','Reconcile physical stock to system'],['PDC','Review outstanding cheques / PDCs'],['EXPENSES','Confirm expenses and payment vouchers are posted'],['GL_REVIEW','Review trial balance and unusual balances'],['AUDIT','Resolve critical audit exceptions'],['REPORTS','Generate and review management reports']];await prisma.accountingPeriod.create({data:{name,startDate:start,endDate:end,checklists:{create:items.map(([itemCode,title])=>({itemCode,title}))}}});}
  console.log('Dariltweens v6.0 Accounting & Control Suite installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
