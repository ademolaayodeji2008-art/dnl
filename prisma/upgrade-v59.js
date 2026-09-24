import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const auditPerms=['AUDIT_VIEW','AUDIT_QUERY_CREATE','AUDIT_QUERY_RESPOND','AUDIT_QUERY_RESOLVE'];
const auditorRead=[
  'PV_VIEW_ALL','EXPENSE_VIEW','REPORT_VIEW',
  'CUSTOMER_VIEW','INVOICE_VIEW','RECEIPT_VIEW','RECEIVABLE_VIEW','CHEQUE_VIEW','SALES_REPORT_VIEW',
  'ITEM_VIEW','INVENTORY_VIEW','INVENTORY_ISSUE_VIEW','LOCATION_VIEW',
  'SUPPLIER_VIEW','PURCHASE_VIEW','PURCHASE_EXPORT','BUSINESS_REPORT_VIEW','BANK_VIEW',
  'SALES_RETURN_VIEW','PURCHASE_RETURN_VIEW',
  'AUDIT_VIEW','AUDIT_QUERY_CREATE','AUDIT_QUERY_RESOLVE'
];
const responderRoles=['ACCOUNT_OFFICER','CEO','ADMIN','FINANCE_MANAGER','SUPER_ADMIN'];
async function grant(roleCode,codes){
  const role=await prisma.role.findUnique({where:{code:roleCode}});if(!role)return;
  const ps=await prisma.permission.findMany({where:{code:{in:codes}}});
  for(const p of ps)await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}});
}
async function main(){
  await prisma.role.upsert({where:{code:'INTERNAL_AUDITOR'},update:{name:'Internal Auditor',description:'Independent read-only operational review with audit query workflow',active:true},create:{code:'INTERNAL_AUDITOR',name:'Internal Auditor',description:'Independent read-only operational review with audit query workflow',active:true}});
  for(const code of auditPerms)await prisma.permission.upsert({where:{code},update:{description:code.replaceAll('_',' ')},create:{code,description:code.replaceAll('_',' ')}});
  await grant('INTERNAL_AUDITOR',auditorRead);
  for(const r of responderRoles)await grant(r,['AUDIT_VIEW','AUDIT_QUERY_RESPOND']);
  await grant('SUPER_ADMIN',auditPerms);
  console.log('Dariltweens v5.9 Internal Auditor and Audit Centre permissions installed.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
