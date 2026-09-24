import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth,permit } from '../src/middleware.js';
import { audit,nextSequenceNo } from '../src/utils.js';
import { flagException,num,round2 } from '../src/accounting.js';

const r=Router();r.use(auth);
const today0=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const today1=()=>{const d=new Date();d.setHours(23,59,59,999);return d};

r.get('/overview',permit('CONTROL_CENTRE_VIEW'),async(req,res)=>{
  const t0=today0(),t1=today1(),now=new Date(),soon=new Date(Date.now()+60*86400000);
  const [sales,collections,purchases,supplierPayments,expenses,banks,items,pvPending,auditOpen,overdueSales,overduePurchases,batches]=await Promise.all([
    prisma.salesInvoice.aggregate({where:{invoiceDate:{gte:t0,lte:t1},status:{not:'CANCELLED'}},_sum:{totalAmount:true},_count:{_all:true}}),
    prisma.salesPayment.aggregate({where:{paymentDate:{gte:t0,lte:t1}},_sum:{amount:true},_count:{_all:true}}),
    prisma.purchaseBill.aggregate({where:{billDate:{gte:t0,lte:t1},status:{not:'CANCELLED'}},_sum:{totalAmount:true},_count:{_all:true}}),
    prisma.purchasePayment.aggregate({where:{paymentDate:{gte:t0,lte:t1}},_sum:{amount:true},_count:{_all:true}}),
    prisma.expense.aggregate({where:{date:{gte:t0,lte:t1}},_sum:{amount:true},_count:{_all:true}}),
    prisma.companyBank.findMany({where:{active:true},select:{currentBalance:true}}),
    prisma.inventoryItem.findMany({where:{active:true},select:{id:true,name:true,itemCode:true,currentStock:true,reorderLevel:true,costPrice:true}}),
    prisma.voucher.count({where:{status:{in:['PENDING_APPROVAL','APPROVED_PENDING_PAYMENT','PAID_AWAITING_CONFIRMATION']}}}),
    prisma.auditException.count({where:{status:{in:['OPEN','ACKNOWLEDGED']}}}),
    prisma.salesInvoice.aggregate({where:{status:{not:'CANCELLED'},outstanding:{gt:0},dueDate:{lt:t0}},_sum:{outstanding:true},_count:{_all:true}}),
    prisma.purchaseBill.aggregate({where:{status:{not:'CANCELLED'},outstanding:{gt:0},dueDate:{lt:t0}},_sum:{outstanding:true},_count:{_all:true}}),
    prisma.inventoryBatch.findMany({where:{status:'ACTIVE',expiryDate:{gte:now,lte:soon}},include:{item:true,location:true},orderBy:{expiryDate:'asc'},take:20})
  ]);
  const low=items.filter(x=>num(x.currentStock)<=num(x.reorderLevel));
  res.json({today:{sales:round2(sales._sum.totalAmount),salesCount:sales._count._all,collections:round2(collections._sum.amount),collectionCount:collections._count._all,purchases:round2(purchases._sum.totalAmount),purchaseCount:purchases._count._all,supplierPayments:round2(supplierPayments._sum.amount),supplierPaymentCount:supplierPayments._count._all,expenses:round2(expenses._sum.amount),expenseCount:expenses._count._all},bankBalance:round2(banks.reduce((s,x)=>s+num(x.currentBalance),0)),stockValue:round2(items.reduce((s,x)=>s+num(x.currentStock)*num(x.costPrice),0)),lowStockCount:low.length,lowStock:low.slice(0,15).map(x=>({...x,currentStock:num(x.currentStock),reorderLevel:num(x.reorderLevel)})),pvPending,auditOpen,overdueReceivables:{count:overdueSales._count._all,amount:round2(overdueSales._sum.outstanding)},overduePayables:{count:overduePurchases._count._all,amount:round2(overduePurchases._sum.outstanding)},expiringBatches:batches.map(x=>({...x,quantity:num(x.quantity)}))});
});

function bucket(days){if(days<=0)return 'current';if(days<=30)return 'd1_30';if(days<=60)return 'd31_60';if(days<=90)return 'd61_90';return 'd90plus'}
r.get('/ageing/:type',permit('AGEING_VIEW'),async(req,res)=>{try{
  const asOf=req.query.asOf?new Date(req.query.asOf+'T23:59:59.999'):new Date(),type=String(req.params.type).toLowerCase();
  if(type==='receivables'){
    const customers=await prisma.customer.findMany({where:{active:true},include:{invoices:{where:{status:{not:'CANCELLED'},invoiceDate:{lte:asOf},outstanding:{gt:0}}}}});
    const rows=customers.map(c=>{const a={customerId:c.id,code:c.customerCode,name:c.name,current:0,d1_30:0,d31_60:0,d61_90:0,d90plus:0,total:num(c.openingBalance)};if(num(c.openingBalance))a.d90plus+=num(c.openingBalance);for(const x of c.invoices){const due=x.dueDate||x.invoiceDate,days=Math.floor((asOf-new Date(due))/86400000),k=bucket(days);a[k]+=num(x.outstanding);a.total+=num(x.outstanding)}Object.keys(a).forEach(k=>{if(typeof a[k]==='number')a[k]=round2(a[k])});return a}).filter(x=>x.total!==0);return res.json({type:'receivables',asOf,rows,totals:rows.reduce((a,x)=>{for(const k of ['current','d1_30','d31_60','d61_90','d90plus','total'])a[k]=round2((a[k]||0)+x[k]);return a},{})});
  }
  if(type==='payables'){
    const suppliers=await prisma.supplier.findMany({where:{active:true},include:{bills:{where:{status:{not:'CANCELLED'},billDate:{lte:asOf},outstanding:{gt:0}}}}});
    const rows=suppliers.map(s=>{const a={supplierId:s.id,code:s.supplierCode,name:s.name,current:0,d1_30:0,d31_60:0,d61_90:0,d90plus:0,total:num(s.openingBalance)};if(num(s.openingBalance))a.d90plus+=num(s.openingBalance);for(const x of s.bills){const due=x.dueDate||x.billDate,days=Math.floor((asOf-new Date(due))/86400000),k=bucket(days);a[k]+=num(x.outstanding);a.total+=num(x.outstanding)}Object.keys(a).forEach(k=>{if(typeof a[k]==='number')a[k]=round2(a[k])});return a}).filter(x=>x.total!==0);return res.json({type:'payables',asOf,rows,totals:rows.reduce((a,x)=>{for(const k of ['current','d1_30','d31_60','d61_90','d90plus','total'])a[k]=round2((a[k]||0)+x[k]);return a},{})});
  }
  throw new Error('Ageing type must be receivables or payables.');
}catch(e){res.status(400).json({message:e.message})}});

r.get('/exceptions',permit('AUDIT_EXCEPTION_VIEW'),async(req,res)=>{const where={};if(req.query.status)where.status=req.query.status;if(req.query.severity)where.severity=req.query.severity;const rows=await prisma.auditException.findMany({where,orderBy:{exceptionDate:'desc'},take:1000});res.json(rows)});
r.post('/exceptions/scan',permit('AUDIT_EXCEPTION_SCAN'),async(req,res)=>{try{
  let created=0;const discountPct=Number((await prisma.setting.findUnique({where:{key:'DISCOUNT_EXCEPTION_PERCENT'}}))?.value||10),highValue=Number((await prisma.setting.findUnique({where:{key:'HIGH_VALUE_EXCEPTION_AMOUNT'}}))?.value||1000000),days=Number((await prisma.setting.findUnique({where:{key:'BACKDATE_EXCEPTION_DAYS'}}))?.value||7);const since=new Date(Date.now()-90*86400000);
  const invoices=await prisma.salesInvoice.findMany({where:{createdAt:{gte:since},status:{not:'CANCELLED'}}});for(const x of invoices){const pct=num(x.subtotal)>0?num(x.discountAmount)/num(x.subtotal)*100:0;if(pct>=discountPct){const before=await prisma.auditException.count({where:{category:'HIGH_DISCOUNT',entity:'SALES_INVOICE',entityId:x.id,status:{in:['OPEN','ACKNOWLEDGED']}}});await flagException({category:'HIGH_DISCOUNT',severity:pct>=discountPct*2?'HIGH':'MEDIUM',title:`High discount on ${x.invoiceNo}`,description:`Invoice discount is ${pct.toFixed(1)}%, above the ${discountPct}% review threshold.`,entity:'SALES_INVOICE',entityId:x.id});if(!before)created++;}if(num(x.totalAmount)>=highValue){const before=await prisma.auditException.count({where:{category:'HIGH_VALUE',entity:'SALES_INVOICE',entityId:x.id,status:{in:['OPEN','ACKNOWLEDGED']}}});await flagException({category:'HIGH_VALUE',severity:'MEDIUM',title:`High-value sales invoice ${x.invoiceNo}`,description:`Invoice value ₦${num(x.totalAmount).toLocaleString()} meets the ₦${highValue.toLocaleString()} review threshold.`,entity:'SALES_INVOICE',entityId:x.id});if(!before)created++;}const diff=Math.floor((new Date(x.createdAt)-new Date(x.invoiceDate))/86400000);if(diff>days){const before=await prisma.auditException.count({where:{category:'BACKDATED_TRANSACTION',entity:'SALES_INVOICE',entityId:x.id,status:{in:['OPEN','ACKNOWLEDGED']}}});await flagException({category:'BACKDATED_TRANSACTION',severity:diff>30?'HIGH':'MEDIUM',title:`Backdated invoice ${x.invoiceNo}`,description:`Invoice was entered ${diff} day(s) after its invoice date.`,entity:'SALES_INVOICE',entityId:x.id});if(!before)created++;}}
  const manual=await prisma.bankTransaction.findMany({where:{createdAt:{gte:since},referenceType:'MANUAL'}});for(const x of manual){const before=await prisma.auditException.count({where:{category:'MANUAL_BANK_ENTRY',entity:'BANK_TRANSACTION',entityId:x.id,status:{in:['OPEN','ACKNOWLEDGED']}}});await flagException({category:'MANUAL_BANK_ENTRY',severity:num(x.amount)>=highValue?'HIGH':'MEDIUM',title:`Manual bank entry ${x.transactionNo}`,description:`Manual ${x.type.toLowerCase()} of ₦${num(x.amount).toLocaleString()} requires review.`,entity:'BANK_TRANSACTION',entityId:x.id});if(!before)created++;}
  const adjustments=await prisma.stockAdjustment.findMany({where:{createdAt:{gte:since}},include:{lines:{include:{item:true}}}});for(const x of adjustments){const value=x.lines.reduce((s,l)=>s+num(l.baseQuantity)*num(l.item.costPrice),0);if(value>=highValue/4){const before=await prisma.auditException.count({where:{category:'STOCK_ADJUSTMENT',entity:'STOCK_ADJUSTMENT',entityId:x.id,status:{in:['OPEN','ACKNOWLEDGED']}}});await flagException({category:'STOCK_ADJUSTMENT',severity:value>=highValue?'HIGH':'MEDIUM',title:`Material stock adjustment ${x.adjustmentNo}`,description:`Estimated stock value adjusted: ₦${round2(value).toLocaleString()}.`,entity:'STOCK_ADJUSTMENT',entityId:x.id});if(!before)created++;}}
  await audit(req.user.id,'SCAN_AUDIT_EXCEPTIONS','AUDIT_EXCEPTION',null,{created},req.ip);res.json({created});
}catch(e){res.status(400).json({message:e.message})}});
r.post('/exceptions/:id/acknowledge',permit('AUDIT_EXCEPTION_MANAGE'),async(req,res)=>{try{const row=await prisma.auditException.update({where:{id:req.params.id},data:{status:'ACKNOWLEDGED',acknowledgedById:req.user.id,acknowledgedAt:new Date()}});res.json(row)}catch(e){res.status(400).json({message:e.message})}});
r.post('/exceptions/:id/resolve',permit('AUDIT_EXCEPTION_MANAGE'),async(req,res)=>{try{const resolution=String(req.body.resolution||'').trim();if(!resolution)throw new Error('Resolution is required.');const row=await prisma.auditException.update({where:{id:req.params.id},data:{status:'RESOLVED',resolvedById:req.user.id,resolvedAt:new Date(),resolution}});await audit(req.user.id,'RESOLVE_AUDIT_EXCEPTION','AUDIT_EXCEPTION',row.id,{resolution},req.ip);res.json(row)}catch(e){res.status(400).json({message:e.message})}});

const controlKeys=['PASSWORD_EXPIRY_DAYS','LOGIN_MAX_ATTEMPTS','LOCKOUT_MINUTES','BACKDATE_EXCEPTION_DAYS','DISCOUNT_EXCEPTION_PERCENT','HIGH_VALUE_EXCEPTION_AMOUNT','PURCHASE_APPROVAL_THRESHOLD','PAYMENT_APPROVAL_THRESHOLD','EXPIRY_ALERT_DAYS'];
r.get('/settings',permit('CONTROL_SETTINGS_MANAGE'),async(req,res)=>{const rows=await prisma.setting.findMany({where:{key:{in:controlKeys}}});const map={};for(const k of controlKeys)map[k]=rows.find(x=>x.key===k)?.value||'';res.json(map)});
r.put('/settings',permit('CONTROL_SETTINGS_MANAGE'),async(req,res)=>{try{for(const k of controlKeys)if(req.body[k]!==undefined)await prisma.setting.upsert({where:{key:k},update:{value:String(req.body[k])},create:{key:k,value:String(req.body[k]),description:'Dariltweens v6.0 control setting'}});await audit(req.user.id,'UPDATE_CONTROL_SETTINGS','SETTING',null,{keys:Object.keys(req.body).filter(k=>controlKeys.includes(k))},req.ip);res.json({message:'Control settings updated.'})}catch(e){res.status(400).json({message:e.message})}});

export default r;
