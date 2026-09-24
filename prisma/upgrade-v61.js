import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();

const accounts=[
 ['1010','Petty Cash','ASSET','OPERATING'],['1020','Cash Collection / POS Clearing','ASSET','OPERATING'],
 ['1110','Staff Advances','ASSET','OPERATING'],['1120','Other Receivables','ASSET','OPERATING'],['1310','Withholding Tax Receivable','ASSET','OPERATING'],['1400','Prepayments','ASSET','OPERATING'],
 ['1500','Property, Plant & Equipment','ASSET','INVESTING'],['1510','Plant & Machinery','ASSET','INVESTING'],['1520','Motor Vehicles','ASSET','INVESTING'],['1530','Furniture & Fittings','ASSET','INVESTING'],['1540','Computer & Office Equipment','ASSET','INVESTING'],['1590','Accumulated Depreciation','ASSET','INVESTING'],
 ['2110','Withholding Tax Payable','LIABILITY','OPERATING'],['2120','PAYE Payable','LIABILITY','OPERATING'],['2130','Pension Payable','LIABILITY','OPERATING'],['2140','Accrued Expenses','LIABILITY','OPERATING'],['2500','Short-Term Loans','LIABILITY','FINANCING'],['2600','Long-Term Loans','LIABILITY','FINANCING'],
 ['3010','Share Capital','EQUITY','FINANCING'],['3020','Dividends / Drawings','EQUITY','FINANCING'],
 ['4050','Other Operating Income','REVENUE','OPERATING'],
 ['5100','Direct Distribution / Freight Cost','EXPENSE','OPERATING'],
 ['6010','Salaries & Wages','EXPENSE','OPERATING'],['6020','Rent & Rates','EXPENSE','OPERATING'],['6030','Utilities','EXPENSE','OPERATING'],['6040','Transport & Delivery','EXPENSE','OPERATING'],['6050','Advertising & Marketing','EXPENSE','OPERATING'],['6060','Repairs & Maintenance','EXPENSE','OPERATING'],['6070','Professional Fees','EXPENSE','OPERATING'],['6080','Office & Administrative Expenses','EXPENSE','OPERATING'],['6090','Depreciation Expense','EXPENSE','OPERATING'],['6210','Interest / Finance Cost','EXPENSE','FINANCING'],['6300','Income Tax Expense','EXPENSE','OPERATING']
];
async function main(){
  for(const [accountCode,name,type,cashFlowGroup] of accounts){
    await prisma.chartAccount.upsert({where:{accountCode},update:{name,type,cashFlowGroup,active:true},create:{accountCode,name,type,cashFlowGroup,active:true,allowPosting:true}});
  }
  await prisma.setting.upsert({where:{key:'SYSTEM_VERSION'},update:{value:'6.1.0'},create:{key:'SYSTEM_VERSION',value:'6.1.0',description:'Dariltweens Business System version'}});
  console.log(`Dariltweens v6.1 accounting reporting upgrade installed. ${accounts.length} detailed chart accounts ensured.`);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
