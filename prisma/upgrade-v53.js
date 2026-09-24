import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const perms=['INVENTORY_ISSUE_VIEW','INVENTORY_ISSUE_CREATE','PURCHASE_IMPORT','PURCHASE_EXPORT'];
const roleMap={
 INVENTORY_OFFICER:['INVENTORY_ISSUE_VIEW','INVENTORY_ISSUE_CREATE','PURCHASE_IMPORT','PURCHASE_EXPORT','BUSINESS_REPORT_VIEW'],
 ACCOUNT_OFFICER:['INVENTORY_ISSUE_VIEW','PURCHASE_EXPORT'],
 CEO:['INVENTORY_ISSUE_VIEW','PURCHASE_EXPORT'],
 ADMIN:['INVENTORY_ISSUE_VIEW','INVENTORY_ISSUE_CREATE','PURCHASE_IMPORT','PURCHASE_EXPORT'],
 SUPER_ADMIN:['*']
};
async function main(){for(const code of perms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});const all=await prisma.permission.findMany();for(const [rc,wanted] of Object.entries(roleMap)){const role=await prisma.role.findUnique({where:{code:rc}});if(!role)continue;for(const p of all){if(wanted.includes('*')||wanted.includes(p.code))await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}})}}console.log('Dariltweens v5.3 permissions installed.');}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
