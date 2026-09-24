import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main(){
  const role = await prisma.role.findUnique({where:{code:'ACCOUNT_OFFICER'}});
  if(!role) throw new Error('ACCOUNT_OFFICER role not found. Run the seed first.');

  const wanted = ['REPORT_VIEW','EXPENSE_VIEW'];
  for(const code of wanted){
    const perm = await prisma.permission.findUnique({where:{code}});
    if(!perm) throw new Error(`Permission ${code} not found.`);
    await prisma.rolePermission.upsert({
      where:{roleId_permissionId:{roleId:role.id,permissionId:perm.id}},
      update:{allowed:true},
      create:{roleId:role.id,permissionId:perm.id,allowed:true}
    });
  }
  console.log('v2.3 upgrade complete: Account Officer can view reports and expenses.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
