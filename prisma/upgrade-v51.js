import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const perms=['BANK_VIEW','BANK_MANAGE','BANK_TRANSACTION_CREATE'];
const fullRoles=['ACCOUNT_OFFICER','CEO','ADMIN','SUPER_ADMIN'];
async function main(){
  for(const code of perms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  const ps=await prisma.permission.findMany({where:{code:{in:perms}}});
  for(const roleCode of fullRoles){const role=await prisma.role.findUnique({where:{code:roleCode}});if(!role)continue;for(const p of ps)await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}});}
  console.log('Dariltweens v5.1 Banking permissions installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
