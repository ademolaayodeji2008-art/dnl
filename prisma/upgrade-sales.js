import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();

const roles=[['SALES_PERSON','Sales Person']];
const permissions=[
  'CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL',
  'SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST',
  'CHEQUE_VIEW','CHEQUE_CREATE','CHEQUE_PRESENT','CHEQUE_CLEAR','CHEQUE_BOUNCE','CHEQUE_CANCEL','CHEQUE_REPLACE','SALES_REPORT_VIEW','BANK_VIEW','BANK_MANAGE','BANK_TRANSACTION_CREATE'
];
const finance=[...permissions];
const roleMap={
  SALES_PERSON:['CUSTOMER_VIEW','CUSTOMER_CREATE','INVOICE_VIEW','INVOICE_CREATE','ITEM_VIEW'],
  ACCOUNT_OFFICER:finance,
  CEO:finance,
  ADMIN:finance,
  SUPER_ADMIN:['*']
};

async function main(){
  for(const [code,name] of roles)await prisma.role.upsert({where:{code},update:{name,active:true},create:{code,name,active:true}});
  for(const code of permissions)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  const allPerms=await prisma.permission.findMany({where:{code:{in:permissions}}});
  for(const [roleCode,wanted] of Object.entries(roleMap)){
    const role=await prisma.role.findUnique({where:{code:roleCode}});if(!role)continue;
    for(const perm of allPerms){const allowed=wanted.includes('*')||wanted.includes(perm.code);await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:perm.id}},update:{allowed},create:{roleId:role.id,permissionId:perm.id,allowed}});}
  }
  await prisma.setting.upsert({where:{key:'APP_NAME'},update:{value:'Dariltweens Nigeria Limited Business & Payment Control System'},create:{key:'APP_NAME',value:'Dariltweens Nigeria Limited Business & Payment Control System'}});
  console.log('Dariltweens Sales/Receivables/Inventory permissions installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
