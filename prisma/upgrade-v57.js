import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const perms=['SALES_RETURN_VIEW','SALES_RETURN_CREATE','CUSTOMER_REFUND_CREATE','PURCHASE_RETURN_VIEW','PURCHASE_RETURN_CREATE','SUPPLIER_REFUND_CREATE'];
const roleMap={
  SALES_PERSON:['SALES_RETURN_VIEW','SALES_RETURN_CREATE'],
  INVENTORY_OFFICER:['PURCHASE_RETURN_VIEW','PURCHASE_RETURN_CREATE'],
  ACCOUNT_OFFICER:perms,
  CEO:perms,
  ADMIN:perms,
  SUPER_ADMIN:['*']
};
async function main(){
  for(const code of perms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  const all=await prisma.permission.findMany({where:{code:{in:perms}}});
  for(const [rc,wanted] of Object.entries(roleMap)){const role=await prisma.role.findUnique({where:{code:rc}});if(!role)continue;for(const p of all)if(wanted.includes('*')||wanted.includes(p.code))await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}})}
  console.log('Dariltweens v5.7 returns and refunds permissions installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
