import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
async function main(){
  const role=await prisma.role.findUnique({where:{code:'ADMIN'}});
  if(!role) throw new Error('ADMIN role not found.');
  const allowed=['PV_VIEW_ALL','EXPENSE_VIEW','REPORT_VIEW','STAFF_MANAGE'];
  const perms=await prisma.permission.findMany();
  await prisma.$transaction(async tx=>{
    await tx.rolePermission.updateMany({where:{roleId:role.id},data:{allowed:false}});
    for(const p of perms.filter(x=>allowed.includes(x.code))){
      await tx.rolePermission.upsert({
        where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},
        update:{allowed:true},
        create:{roleId:role.id,permissionId:p.id,allowed:true}
      });
    }
  });
  console.log('ADMIN separation-of-duties permissions applied.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
