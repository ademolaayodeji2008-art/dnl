import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const roles=[['INVENTORY_OFFICER','Inventory Officer'],['VISITOR','Visitor']];
const perms=['SUPPLIER_VIEW','SUPPLIER_CREATE','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'];
const roleMap={
 INVENTORY_OFFICER:['ITEM_VIEW','ITEM_MANAGE','INVENTORY_VIEW','STOCK_ADJUST','SUPPLIER_VIEW','SUPPLIER_CREATE','PURCHASE_VIEW','PURCHASE_CREATE'],
 VISITOR:['PV_VIEW_ALL'],
 ACCOUNT_OFFICER:['PV_RAISE','PV_VIEW_ALL','SUPPLIER_VIEW','SUPPLIER_CREATE','PURCHASE_VIEW','PURCHASE_PAY','BUSINESS_REPORT_VIEW'],
 CEO:['PV_RAISE','PV_VIEW_ALL','SUPPLIER_VIEW','PURCHASE_VIEW','BUSINESS_REPORT_VIEW'],
 ADMIN:['PV_RAISE','PV_VIEW_ALL','SUPPLIER_VIEW','SUPPLIER_CREATE','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_PAY','BUSINESS_REPORT_VIEW'],
 SUPER_ADMIN:['*']
};
async function main(){for(const [code,name] of roles)await prisma.role.upsert({where:{code},update:{name,active:true},create:{code,name,active:true}});for(const code of perms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});const all=await prisma.permission.findMany();for(const [rc,wanted] of Object.entries(roleMap)){const role=await prisma.role.findUnique({where:{code:rc}});if(!role)continue;for(const p of all){if(wanted.includes('*')||wanted.includes(p.code))await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}})}}console.log('Dariltweens v5.2 roles and permissions installed.');}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
