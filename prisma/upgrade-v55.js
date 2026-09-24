import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const perms=['SUPPLIER_EDIT','BUSINESS_REPORT_VIEW'];
const roleMap={
  SALES_PERSON:['CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','INVOICE_VIEW','INVOICE_CREATE','INVOICE_CANCEL','SALES_PAYMENT_CREATE','RECEIPT_VIEW','RECEIVABLE_VIEW','ITEM_VIEW','CHEQUE_VIEW','CHEQUE_CREATE','SALES_REPORT_VIEW','BUSINESS_REPORT_VIEW'],
  INVENTORY_OFFICER:['SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT','BUSINESS_REPORT_VIEW'],
  ACCOUNT_OFFICER:['SUPPLIER_EDIT'],
  ADMIN:['SUPPLIER_EDIT'],
  SUPER_ADMIN:['*']
};
async function main(){
  await prisma.role.upsert({where:{code:'SALES_PERSON'},update:{name:'Sales Officer',active:true},create:{code:'SALES_PERSON',name:'Sales Officer',active:true}});
  for(const code of perms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  const all=await prisma.permission.findMany();
  for(const [rc,wanted] of Object.entries(roleMap)){
    const role=await prisma.role.findUnique({where:{code:rc}});if(!role)continue;
    for(const p of all)if(wanted.includes('*')||wanted.includes(p.code))await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}});
  }
  console.log('Dariltweens v5.5 sales, inventory reporting and supplier permissions installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
