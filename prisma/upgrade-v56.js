import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const perms=['INVOICE_EDIT','INVOICE_DELETE','PURCHASE_EDIT','PURCHASE_DELETE','BANK_DELETE'];
const roleMap={
  SALES_PERSON:['INVOICE_EDIT','INVOICE_DELETE'],
  INVENTORY_OFFICER:['PURCHASE_EDIT','PURCHASE_DELETE'],
  ACCOUNT_OFFICER:['INVOICE_EDIT','INVOICE_DELETE','PURCHASE_EDIT','PURCHASE_DELETE','BANK_DELETE'],
  CEO:['INVOICE_EDIT','INVOICE_DELETE','PURCHASE_EDIT','PURCHASE_DELETE','BANK_DELETE'],
  ADMIN:['INVOICE_EDIT','INVOICE_DELETE','PURCHASE_EDIT','PURCHASE_DELETE','BANK_DELETE'],
  SUPER_ADMIN:['*']
};
async function main(){
  for(const code of perms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  const all=await prisma.permission.findMany({where:{code:{in:perms}}});
  for(const [rc,wanted] of Object.entries(roleMap)){const role=await prisma.role.findUnique({where:{code:rc}});if(!role)continue;for(const p of all)if(wanted.includes('*')||wanted.includes(p.code))await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}})}
  console.log('Dariltweens v5.6 edit/delete controls installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
