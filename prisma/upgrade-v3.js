import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
async function main(){
  const access={
    ACCOUNT_OFFICER:['REPORT_VIEW','EXPENSE_VIEW'],
    CEO:['REPORT_VIEW','EXPENSE_VIEW'],
    PAYABLE_OFFICER:['REPORT_VIEW','EXPENSE_VIEW'],
    FINANCE_MANAGER:['REPORT_VIEW','EXPENSE_VIEW'],
    ADMIN:['REPORT_VIEW','EXPENSE_VIEW'],
    SUPER_ADMIN:['REPORT_VIEW','EXPENSE_VIEW']
  };
  for(const [roleCode,codes] of Object.entries(access)){
    const role=await prisma.role.findUnique({where:{code:roleCode}});
    if(!role) continue;
    for(const code of codes){
      const p=await prisma.permission.findUnique({where:{code}});
      if(!p) continue;
      await prisma.rolePermission.upsert({
        where:{roleId_permissionId:{roleId:role.id,permissionId:p.id}},
        update:{allowed:true},create:{roleId:role.id,permissionId:p.id,allowed:true}
      });
    }
  }
  const defaults={
    COMPANY_NAME:'Your Company Limited',COMPANY_ADDRESS:'',COMPANY_EMAIL:'',
    COMPANY_PHONE:'',CURRENCY:'NGN',PV_PREFIX:'PV',TIMEZONE:'Africa/Lagos',
    EMAIL_ENABLED:'false',SMTP_HOST:'',SMTP_PORT:'587',SMTP_USER:'',SMTP_FROM:''
  };
  for(const [key,value] of Object.entries(defaults)){
    await prisma.companySetting.upsert({where:{key},update:{},create:{key,value}});
  }
  console.log('Payment Voucher Pro v3.0 upgrade complete.');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
