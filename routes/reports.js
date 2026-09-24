import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import ExcelJS from 'exceljs';

const r=Router();
r.use(auth);

function dateWhere(from,to){
  if(!from&&!to) return undefined;
  return {
    ...(from?{gte:new Date(from)}:{}),
    ...(to?{lte:new Date(to+'T23:59:59')}:{})
  };
}

r.get('/dashboard',async(req,res)=>{
  const own=!req.permissions.includes('PV_VIEW_ALL')&&!req.roles.includes('SUPER_ADMIN');
  const pvWhere=own?{raisedById:req.user.id}:{};
  const canSales=req.permissions.includes('INVOICE_VIEW')||req.roles.includes('SUPER_ADMIN');
  const [vouchers,totalExpenses,salesInvoices,cheques,items,customers,banks] = await Promise.all([
    prisma.voucher.findMany({where:pvWhere,select:{status:true,totalAmount:true}}),
    prisma.expense.aggregate({where:own?{voucher:{raisedById:req.user.id}}:{},_sum:{amount:true}}),
    canSales?prisma.salesInvoice.findMany({where:{status:{not:'CANCELLED'}},select:{status:true,totalAmount:true,amountPaid:true,outstanding:true,dueDate:true}}):[],
    canSales?prisma.customerCheque.findMany({select:{status:true,amount:true,expectedPresentationDate:true}}):[],
    canSales?prisma.inventoryItem.findMany({where:{active:true},select:{currentStock:true,reorderLevel:true,costPrice:true}}):[],
    canSales?prisma.customer.count({where:{active:true}}):0,
    canSales?prisma.companyBank.findMany({where:{active:true},select:{currentBalance:true}}):[]
  ]);
  const counts={};let totalAmount=0;
  for(const v of vouchers){counts[v.status]=(counts[v.status]||0)+1;totalAmount+=Number(v.totalAmount);}
  const today=new Date();today.setHours(0,0,0,0);
  const sales={totalSales:0,receivables:0,amountCollected:0,invoiceCount:salesInvoices.length,paidInvoices:0,partialInvoices:0,overdueInvoices:0,notYetDueInvoices:0};
  for(const x of salesInvoices){sales.totalSales+=Number(x.totalAmount);sales.receivables+=Number(x.outstanding);sales.amountCollected+=Number(x.amountPaid);if(x.status==='PAID')sales.paidInvoices++;if(x.status==='PARTIALLY_PAID')sales.partialInvoices++;if(Number(x.outstanding)>0&&x.dueDate){if(new Date(x.dueDate)<today)sales.overdueInvoices++;else sales.notYetDueInvoices++;}}
  const chequeCounts={HELD:0,PRESENTED:0,CLEARED:0,BOUNCED:0,CANCELLED:0,REPLACED:0,DUE:0,NOT_YET_DUE:0};
  for(const c of cheques){chequeCounts[c.status]=(chequeCounts[c.status]||0)+1;if(c.status==='HELD'){if(new Date(c.expectedPresentationDate)<=today)chequeCounts.DUE++;else chequeCounts.NOT_YET_DUE++;}}
  const inventory={itemCount:items.length,lowStock:0,stockValue:0};for(const i of items){if(Number(i.currentStock)<=Number(i.reorderLevel))inventory.lowStock++;inventory.stockValue+=Number(i.currentStock)*Number(i.costPrice);}
  const banking={accountCount:banks.length,totalBalance:banks.reduce((sum,b)=>sum+Number(b.currentBalance||0),0)};res.json({counts,totalVouchers:vouchers.length,totalAmount,totalExpenses:Number(totalExpenses._sum.amount||0),sales:{...sales,customerCount:customers},cheques:{total:cheques.length,counts:chequeCounts},inventory,banking});
});

r.get('/vouchers',permit('REPORT_VIEW'),async(req,res)=>{
  const where={};
  if(req.query.status) where.status=req.query.status;
  const range=dateWhere(req.query.from,req.query.to); if(range) where.createdAt=range;
  const rows=await prisma.voucher.findMany({
    where,
    include:{
      raisedBy:{select:{firstName:true,lastName:true,email:true,staffId:true}},
      payment:true
    },
    orderBy:{createdAt:'desc'}
  });
  res.json(rows.map(v=>({
    ...v,
    totalAmount:Number(v.totalAmount),
    payment:v.payment?{...v.payment,amount:Number(v.payment.amount)}:null
  })));
});
r.get('/expenses',permit('EXPENSE_VIEW'),async(req,res)=>{
  const where={};
  const range=dateWhere(req.query.from,req.query.to); if(range) where.date=range;
  if(req.query.categoryId) where.categoryId=req.query.categoryId;
  const rows=await prisma.expense.findMany({where,include:{category:true,voucher:true},orderBy:{date:'desc'}});
  res.json(rows.map(x=>({...x,amount:Number(x.amount)})));
});


r.get('/summary',permit('REPORT_VIEW'),async(req,res)=>{
  const where={};
  const range=dateWhere(req.query.from,req.query.to); if(range) where.createdAt=range;
  const vouchers=await prisma.voucher.findMany({where,select:{status:true,totalAmount:true}});
  const statusCounts={};
  const statusAmounts={};
  for(const v of vouchers){
    statusCounts[v.status]=(statusCounts[v.status]||0)+1;
    statusAmounts[v.status]=(statusAmounts[v.status]||0)+Number(v.totalAmount);
  }
  const expenseWhere={};
  const erange=dateWhere(req.query.from,req.query.to); if(erange) expenseWhere.date=erange;
  if(req.query.categoryId) expenseWhere.categoryId=req.query.categoryId;
  const expenses=await prisma.expense.aggregate({where:expenseWhere,_sum:{amount:true},_count:{_all:true}});
  res.json({
    voucherCount:vouchers.length,
    voucherAmount:vouchers.reduce((s,v)=>s+Number(v.totalAmount),0),
    statusCounts,statusAmounts,
    expenseCount:expenses._count._all,
    expenseAmount:Number(expenses._sum.amount||0)
  });
});


r.get('/vouchers.xlsx',permit('REPORT_VIEW'),async(req,res)=>{
  const where={};
  if(req.query.status) where.status=req.query.status;
  const range=dateWhere(req.query.from,req.query.to); if(range) where.createdAt=range;

  const rows=await prisma.voucher.findMany({
    where,
    include:{
      raisedBy:{select:{firstName:true,lastName:true,email:true,staffId:true}},
      payment:true
    },
    orderBy:{createdAt:'desc'}
  });

  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('Payment Vouchers');

  ws.columns=[
    {header:'PV No',key:'pvNo',width:20},
    {header:'Date Raised',key:'dateRaised',width:16},
    {header:'Raised By',key:'raisedBy',width:24},
    {header:'Staff ID',key:'staffId',width:16},
    {header:'Payee',key:'payee',width:28},
    {header:'Department',key:'department',width:20},
    {header:'Payment Type',key:'paymentType',width:20},
    {header:'Description',key:'description',width:45},
    {header:'Amount',key:'amount',width:18},
    {header:'Currency',key:'currency',width:12},
    {header:'Status',key:'status',width:28},
    {header:'Submitted At',key:'submittedAt',width:20},
    {header:'Approved At',key:'approvedAt',width:20},
    {header:'Paid At',key:'paidAt',width:20},
    {header:'Payment Method',key:'paymentMethod',width:20},
    {header:'Payment Account',key:'paymentAccount',width:24},
    {header:'Payment Reference',key:'paymentReference',width:24}
  ];

  rows.forEach(v=>{
    ws.addRow({
      pvNo:v.pvNo,
      dateRaised:v.createdAt,
      raisedBy:`${v.raisedBy?.firstName||''} ${v.raisedBy?.lastName||''}`.trim(),
      staffId:v.raisedBy?.staffId||v.staffId||'',
      payee:v.payee,
      department:v.department,
      paymentType:v.paymentType||'',
      description:v.description,
      amount:Number(v.totalAmount),
      currency:v.currency,
      status:v.status,
      submittedAt:v.submittedAt,
      approvedAt:v.approvedAt,
      paidAt:v.paidAt,
      paymentMethod:v.payment?.paymentMethod||'',
      paymentAccount:v.payment?.paymentAccount||'',
      paymentReference:v.payment?.reference||''
    });
  });

  ws.getRow(1).font={bold:true};
  ws.views=[{state:'frozen',ySplit:1}];
  ws.getColumn('amount').numFmt='#,##0.00';

  const totalRow=ws.addRow({});
  totalRow.getCell(8).value='Total';
  totalRow.getCell(8).font={bold:true};
  totalRow.getCell(9).value=rows.reduce((s,v)=>s+Number(v.totalAmount),0);
  totalRow.getCell(9).font={bold:true};
  totalRow.getCell(9).numFmt='#,##0.00';

  const type=req.query.status||'ALL';
  const safeType=String(type).replace(/[^A-Z0-9_-]/gi,'_').toLowerCase();
  const filename=`payment_vouchers_${safeType}.xlsx`;

  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

r.get('/expenses.xlsx',permit('EXPENSE_VIEW'),async(req,res)=>{
  const where={};
  const range=dateWhere(req.query.from,req.query.to); if(range) where.date=range;
  if(req.query.categoryId) where.categoryId=req.query.categoryId;
  const rows=await prisma.expense.findMany({where,include:{category:true,voucher:true},orderBy:{date:'desc'}});
  const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('Expenses');
  ws.columns=[
    {header:'Date',key:'date',width:15},{header:'PV No',key:'pv',width:18},{header:'Category',key:'category',width:24},
    {header:'Description',key:'description',width:40},{header:'Payee',key:'payee',width:28},
    {header:'Department',key:'department',width:20},{header:'Amount',key:'amount',width:18}
  ];
  rows.forEach(x=>ws.addRow({date:x.date,pv:x.voucher.pvNo,category:x.category.name,description:x.description,payee:x.payee,department:x.department,amount:Number(x.amount)}));
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="expenses.xlsx"');
  await wb.xlsx.write(res);res.end();
});

r.get('/sales-summary',permit('SALES_REPORT_VIEW'),async(req,res)=>{
  const range=dateWhere(req.query.from,req.query.to);
  const where={status:{not:'CANCELLED'}}; if(range) where.invoiceDate=range;
  if(req.query.customerId) where.customerId=req.query.customerId;
  const [invoices,receipts,cheques,items]=await Promise.all([
    prisma.salesInvoice.findMany({where,include:{customer:{select:{name:true}},lines:{include:{item:{select:{name:true}}}}},orderBy:{invoiceDate:'desc'}}),
    prisma.salesReceipt.findMany({where:range?{receiptDate:range}:{},include:{customer:{select:{name:true}},invoice:{select:{invoiceNo:true}}},orderBy:{receiptDate:'desc'}}),
    prisma.customerCheque.findMany({where:range?{dateReceived:range}:{},include:{customer:{select:{name:true}},invoice:{select:{invoiceNo:true}}},orderBy:{dateReceived:'desc'}}),
    prisma.inventoryItem.findMany({where:{active:true},orderBy:{name:'asc'}})
  ]);
  const totals={sales:0,paid:0,receivables:0}; const byCustomer={},byItem={};
  for(const x of invoices){totals.sales+=Number(x.totalAmount);totals.paid+=Number(x.amountPaid);totals.receivables+=Number(x.outstanding);byCustomer[x.customer.name]=(byCustomer[x.customer.name]||0)+Number(x.totalAmount);for(const l of x.lines)byItem[l.item.name]=(byItem[l.item.name]||0)+Number(l.amount);}
  res.json({totals,invoiceCount:invoices.length,receiptCount:receipts.length,chequeCount:cheques.length,invoices:invoices.map(x=>({...x,totalAmount:Number(x.totalAmount),amountPaid:Number(x.amountPaid),outstanding:Number(x.outstanding)})),receipts:receipts.map(x=>({...x,amount:Number(x.amount)})),cheques:cheques.map(x=>({...x,amount:Number(x.amount)})),stock:items.map(i=>({id:i.id,itemCode:i.itemCode,name:i.name,currentStock:Number(i.currentStock),reorderLevel:Number(i.reorderLevel),costPrice:Number(i.costPrice),stockValue:Number(i.currentStock)*Number(i.costPrice)})),topCustomers:Object.entries(byCustomer).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,amount])=>({name,amount})),topItems:Object.entries(byItem).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,amount])=>({name,amount}))});
});

r.get('/receivables',permit('RECEIVABLE_VIEW'),async(req,res)=>{
  const rows=await prisma.salesInvoice.findMany({where:{status:{notIn:['PAID','CANCELLED']},outstanding:{gt:0}},include:{customer:{select:{customerCode:true,name:true}},cheques:{where:{status:{in:['HELD','PRESENTED']}},select:{amount:true,status:true}}},orderBy:{dueDate:'asc'}});
  const today=new Date();today.setHours(0,0,0,0);
  res.json(rows.map(x=>{const pendingCheque=x.cheques.reduce((s,c)=>s+Number(c.amount),0);const due=x.dueDate?new Date(x.dueDate):null;const age=due?Math.floor((today-due)/(86400000)):0;let aging='CURRENT';if(age>120)aging='ABOVE 120';else if(age>90)aging='91-120';else if(age>60)aging='61-90';else if(age>30)aging='31-60';else if(age>0)aging='1-30';return {id:x.id,invoiceNo:x.invoiceNo,invoiceDate:x.invoiceDate,dueDate:x.dueDate,customer:x.customer,totalAmount:Number(x.totalAmount),amountPaid:Number(x.amountPaid),outstanding:Number(x.outstanding),pendingCheque,uncovered:Math.max(0,Number(x.outstanding)-pendingCheque),aging,status:due&&due<today?'OVERDUE':'NOT YET DUE'};}));
});

export default r;
