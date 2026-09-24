import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth,permit } from '../src/middleware.js';
import { audit,nextSequenceNo } from '../src/utils.js';
import { assertPeriodOpen,postJournal,reverseJournal,round2,num } from '../src/accounting.js';

const r=Router();r.use(auth);
const d0=s=>new Date(String(s)+'T00:00:00');
const d1=s=>new Date(String(s)+'T23:59:59.999');
const range=(from,to,field='journalDate')=>from||to?{[field]:{...(from?{gte:d0(from)}:{}),...(to?{lte:d1(to)}:{})}}:{};

r.get('/accounts',permit('ACCOUNTING_VIEW'),async(req,res)=>{
  const rows=await prisma.chartAccount.findMany({orderBy:{accountCode:'asc'}});res.json(rows);
});
r.post('/accounts',permit('ACCOUNTING_MANAGE'),async(req,res)=>{try{
  const accountCode=String(req.body.accountCode||'').trim(),name=String(req.body.name||'').trim(),type=String(req.body.type||'').toUpperCase();
  if(!accountCode||!name||!['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].includes(type))throw new Error('Account code, name and valid account type are required.');
  const row=await prisma.chartAccount.create({data:{accountCode,name,type,parentId:req.body.parentId||null,cashFlowGroup:String(req.body.cashFlowGroup||'').trim()||null,active:req.body.active!==false,allowPosting:req.body.allowPosting!==false}});
  await audit(req.user.id,'CREATE_GL_ACCOUNT','CHART_ACCOUNT',row.id,{accountCode,name,type},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});
r.put('/accounts/:id',permit('ACCOUNTING_MANAGE'),async(req,res)=>{try{
  const cur=await prisma.chartAccount.findUnique({where:{id:req.params.id}});if(!cur)throw new Error('Account not found.');
  const row=await prisma.chartAccount.update({where:{id:cur.id},data:{accountCode:String(req.body.accountCode??cur.accountCode).trim(),name:String(req.body.name??cur.name).trim(),type:String(req.body.type??cur.type).toUpperCase(),parentId:req.body.parentId===undefined?cur.parentId:(req.body.parentId||null),cashFlowGroup:req.body.cashFlowGroup===undefined?cur.cashFlowGroup:(String(req.body.cashFlowGroup||'').trim()||null),active:req.body.active===undefined?cur.active:Boolean(req.body.active),allowPosting:req.body.allowPosting===undefined?cur.allowPosting:Boolean(req.body.allowPosting)}});
  await audit(req.user.id,'UPDATE_GL_ACCOUNT','CHART_ACCOUNT',row.id,{accountCode:row.accountCode,name:row.name},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.get('/journals',permit('ACCOUNTING_VIEW'),async(req,res)=>{
  const where={...range(req.query.from,req.query.to)};if(req.query.status)where.status=req.query.status;if(req.query.q)where.OR=[{journalNo:{contains:String(req.query.q),mode:'insensitive'}},{description:{contains:String(req.query.q),mode:'insensitive'}},{referenceNo:{contains:String(req.query.q),mode:'insensitive'}}];
  const rows=await prisma.journalEntry.findMany({where,include:{lines:{include:{account:true}}},orderBy:[{journalDate:'desc'},{createdAt:'desc'}],take:1000});
  res.json(rows.map(x=>({...x,lines:x.lines.map(l=>({...l,debit:num(l.debit),credit:num(l.credit)}))})));
});
r.post('/journals',permit('JOURNAL_CREATE'),async(req,res)=>{try{
  const journalDate=req.body.journalDate?new Date(req.body.journalDate):new Date();await assertPeriodOpen(journalDate);
  const raw=Array.isArray(req.body.lines)?req.body.lines:[];if(raw.length<2)throw new Error('Enter at least two journal lines.');
  const row=await postJournal({date:journalDate,description:req.body.description,referenceType:'MANUAL_JOURNAL',referenceNo:String(req.body.referenceNo||'').trim()||null,createdById:req.user.id,lines:raw.map(x=>({accountId:x.accountId,debit:x.debit,credit:x.credit,narration:x.narration}))});
  await audit(req.user.id,'POST_MANUAL_JOURNAL','JOURNAL',row.id,{journalNo:row.journalNo},req.ip);res.json(row);
}catch(e){res.status(e.status||400).json({message:e.message})}});
r.post('/journals/:id/reverse',permit('JOURNAL_REVERSE'),async(req,res)=>{try{
  const row=await reverseJournal(req.params.id,req.user.id,String(req.body.reason||'Correction').trim());await audit(req.user.id,'REVERSE_JOURNAL','JOURNAL',req.params.id,{reversalNo:row.journalNo},req.ip);res.json(row);
}catch(e){res.status(e.status||400).json({message:e.message})}});

async function balances(from,to){
  const rows=await prisma.journalLine.findMany({where:{journalEntry:{status:{in:['POSTED','REVERSED']},...range(from,to)}},include:{account:true,journalEntry:{select:{journalDate:true,journalNo:true,status:true}}}});
  const map=new Map();for(const l of rows){if(l.journalEntry.status==='REVERSED')continue;const k=l.accountId;if(!map.has(k))map.set(k,{accountId:k,accountCode:l.account.accountCode,name:l.account.name,type:l.account.type,debit:0,credit:0,balance:0});const x=map.get(k);x.debit+=num(l.debit);x.credit+=num(l.credit);x.balance=round2(x.debit-x.credit)}return [...map.values()].sort((a,b)=>a.accountCode.localeCompare(b.accountCode));
}
r.get('/trial-balance',permit('ACCOUNTING_VIEW'),async(req,res)=>{const rows=await balances(req.query.from,req.query.to);res.json({rows,totalDebit:round2(rows.reduce((s,x)=>s+x.debit,0)),totalCredit:round2(rows.reduce((s,x)=>s+x.credit,0))})});
r.get('/financial-statements',permit('ACCOUNTING_VIEW'),async(req,res)=>{
  const rows=await balances(req.query.from,req.query.to);
  const revenue=rows.filter(x=>x.type==='REVENUE').map(x=>({...x,amount:round2(x.credit-x.debit)}));const expenses=rows.filter(x=>x.type==='EXPENSE').map(x=>({...x,amount:round2(x.debit-x.credit)}));
  const assets=rows.filter(x=>x.type==='ASSET').map(x=>({...x,amount:round2(x.debit-x.credit)}));const liabilities=rows.filter(x=>x.type==='LIABILITY').map(x=>({...x,amount:round2(x.credit-x.debit)}));const equity=rows.filter(x=>x.type==='EQUITY').map(x=>({...x,amount:round2(x.credit-x.debit)}));
  const totalRevenue=round2(revenue.reduce((s,x)=>s+x.amount,0)),totalExpenses=round2(expenses.reduce((s,x)=>s+x.amount,0));res.json({profitLoss:{revenue,expenses,totalRevenue,totalExpenses,netProfit:round2(totalRevenue-totalExpenses)},balanceSheet:{assets,liabilities,equity,totalAssets:round2(assets.reduce((s,x)=>s+x.amount,0)),totalLiabilities:round2(liabilities.reduce((s,x)=>s+x.amount,0)),totalEquity:round2(equity.reduce((s,x)=>s+x.amount,0))}});
});
r.get('/general-ledger/:accountId',permit('ACCOUNTING_VIEW'),async(req,res)=>{
  const a=await prisma.chartAccount.findUnique({where:{id:req.params.accountId}});if(!a)return res.status(404).json({message:'Account not found.'});
  const lines=await prisma.journalLine.findMany({where:{accountId:a.id,journalEntry:{status:'POSTED',...range(req.query.from,req.query.to)}},include:{journalEntry:true},orderBy:{journalEntry:{journalDate:'asc'}}});let bal=0;const rows=lines.map(l=>{bal=round2(bal+num(l.debit)-num(l.credit));return {date:l.journalEntry.journalDate,journalNo:l.journalEntry.journalNo,description:l.narration||l.journalEntry.description,referenceNo:l.journalEntry.referenceNo,debit:num(l.debit),credit:num(l.credit),balance:bal}});res.json({account:a,rows,balance:bal});
});

r.get('/periods',permit('PERIOD_VIEW'),async(req,res)=>{const rows=await prisma.accountingPeriod.findMany({include:{checklists:true},orderBy:{startDate:'desc'}});res.json(rows)});
r.post('/periods',permit('PERIOD_MANAGE'),async(req,res)=>{try{
  const startDate=d0(req.body.startDate),endDate=d1(req.body.endDate);if(!(startDate<endDate))throw new Error('Valid start and end dates are required.');const name=String(req.body.name||'').trim();if(!name)throw new Error('Period name is required.');
  const overlap=await prisma.accountingPeriod.findFirst({where:{AND:[{startDate:{lte:endDate}},{endDate:{gte:startDate}}]}});if(overlap)throw new Error(`This period overlaps ${overlap.name}.`);
  const items=[['BANK_RECON','Complete bank reconciliation'],['RECEIVABLES','Review receivables and ageing'],['PAYABLES','Review supplier payables and ageing'],['STOCK','Reconcile physical stock to system'],['PDC','Review outstanding cheques / PDCs'],['EXPENSES','Confirm expenses and payment vouchers are posted'],['GL_REVIEW','Review trial balance and unusual balances'],['AUDIT','Resolve critical audit exceptions'],['REPORTS','Generate and review management reports']];
  const row=await prisma.accountingPeriod.create({data:{name,startDate,endDate,checklists:{create:items.map(([itemCode,title])=>({itemCode,title}))}},include:{checklists:true}});await audit(req.user.id,'CREATE_ACCOUNTING_PERIOD','ACCOUNTING_PERIOD',row.id,{name},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});
r.put('/periods/:id/checklist/:itemCode',permit('PERIOD_MANAGE'),async(req,res)=>{try{
  const status=String(req.body.status||'PENDING').toUpperCase();if(!['PENDING','COMPLETE','NOT_APPLICABLE'].includes(status))throw new Error('Invalid checklist status.');
  const row=await prisma.monthEndChecklist.update({where:{periodId_itemCode:{periodId:req.params.id,itemCode:req.params.itemCode}},data:{status,notes:String(req.body.notes||'').trim()||null,completedById:status==='COMPLETE'?req.user.id:null,completedAt:status==='COMPLETE'?new Date():null}});res.json(row);
}catch(e){res.status(400).json({message:e.message})}});
r.post('/periods/:id/close',permit('PERIOD_CLOSE'),async(req,res)=>{try{
  const p=await prisma.accountingPeriod.findUnique({where:{id:req.params.id},include:{checklists:true}});if(!p)throw new Error('Period not found.');const incomplete=p.checklists.filter(x=>x.status==='PENDING');if(incomplete.length)throw new Error(`Complete or mark N/A all month-end checklist items first. ${incomplete.length} item(s) remain.`);
  const row=await prisma.accountingPeriod.update({where:{id:p.id},data:{status:'CLOSED',closedById:req.user.id,closedAt:new Date(),closeNotes:String(req.body.notes||'').trim()||null}});await audit(req.user.id,'CLOSE_ACCOUNTING_PERIOD','ACCOUNTING_PERIOD',p.id,{name:p.name},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});
r.post('/periods/:id/reopen',permit('PERIOD_REOPEN'),async(req,res)=>{try{
  const reason=String(req.body.reason||'').trim();if(!reason)throw new Error('Reopening reason is required.');const row=await prisma.accountingPeriod.update({where:{id:req.params.id},data:{status:'OPEN',reopenedById:req.user.id,reopenedAt:new Date(),closeNotes:`Reopened: ${reason}`}});await audit(req.user.id,'REOPEN_ACCOUNTING_PERIOD','ACCOUNTING_PERIOD',row.id,{reason},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.get('/sequences',permit('SEQUENCE_MANAGE'),async(req,res)=>{res.json(await prisma.sequence.findMany({orderBy:{code:'asc'}}))});
r.put('/sequences/:code',permit('SEQUENCE_MANAGE'),async(req,res)=>{try{
  const code=String(req.params.code).toUpperCase(),prefix=String(req.body.prefix||'').trim().toUpperCase(),padLength=Math.max(3,Math.min(10,Number(req.body.padLength||6)));if(!prefix)throw new Error('Prefix is required.');
  const row=await prisma.sequence.upsert({where:{code},update:{prefix,padLength},create:{code,prefix,padLength,lastNo:0,year:new Date().getFullYear()}});await audit(req.user.id,'UPDATE_DOCUMENT_SEQUENCE','SEQUENCE',code,{prefix,padLength},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.post('/sync-operational',permit('ACCOUNTING_SYNC'),async(req,res)=>{try{
  let created=0,skipped=0,errors=[];
  const has=async(t,id)=>!!(await prisma.journalEntry.findFirst({where:{referenceType:t,referenceId:id}}));
  const invoices=await prisma.salesInvoice.findMany({where:{status:{not:'CANCELLED'}},include:{lines:{include:{item:true}}}});
  for(const x of invoices){if(await has('SALES_INVOICE',x.id)){skipped++;continue}try{const net=round2(num(x.subtotal)-num(x.discountAmount)),vat=round2(x.vatAmount),cogs=round2(x.lines.reduce((s,l)=>s+num(l.stockQuantity)*num(l.item.costPrice),0));const lines=[{systemCode:'AR',debit:x.totalAmount},{systemCode:'SALES',credit:net}];if(vat)lines.push({systemCode:'VAT_OUTPUT',credit:vat});if(cogs){lines.push({systemCode:'COGS',debit:cogs},{systemCode:'INVENTORY',credit:cogs})}await postJournal({date:x.invoiceDate,description:`Sales invoice ${x.invoiceNo}`,referenceType:'SALES_INVOICE',referenceId:x.id,referenceNo:x.invoiceNo,createdById:req.user.id,lines});created++}catch(e){errors.push(`${x.invoiceNo}: ${e.message}`)}}
  const sp=await prisma.salesPayment.findMany();for(const x of sp){if(await has('SALES_PAYMENT',x.id)){skipped++;continue}try{await postJournal({date:x.paymentDate,description:`Customer payment ${x.paymentNo}`,referenceType:'SALES_PAYMENT',referenceId:x.id,referenceNo:x.paymentNo,createdById:req.user.id,lines:[{systemCode:'BANK',debit:x.amount},{systemCode:'AR',credit:x.amount}]});created++}catch(e){errors.push(`${x.paymentNo}: ${e.message}`)}}
  const bills=await prisma.purchaseBill.findMany({where:{status:{not:'CANCELLED'}}});for(const x of bills){if(await has('PURCHASE_BILL',x.id)){skipped++;continue}try{const net=round2(num(x.subtotal)-num(x.discountAmount)),vat=round2(x.vatAmount),lines=[{systemCode:'INVENTORY',debit:net},{systemCode:'AP',credit:x.totalAmount}];if(vat)lines.splice(1,0,{systemCode:'VAT_INPUT',debit:vat});await postJournal({date:x.billDate,description:`Purchase bill ${x.billNo}`,referenceType:'PURCHASE_BILL',referenceId:x.id,referenceNo:x.billNo,createdById:req.user.id,lines});created++}catch(e){errors.push(`${x.billNo}: ${e.message}`)}}
  const pp=await prisma.purchasePayment.findMany();for(const x of pp){if(await has('PURCHASE_PAYMENT',x.id)){skipped++;continue}try{await postJournal({date:x.paymentDate,description:`Supplier payment ${x.paymentNo}`,referenceType:'PURCHASE_PAYMENT',referenceId:x.id,referenceNo:x.paymentNo,createdById:req.user.id,lines:[{systemCode:'AP',debit:x.amount},{systemCode:'BANK',credit:x.amount}]});created++}catch(e){errors.push(`${x.paymentNo}: ${e.message}`)}}
  const ex=await prisma.expense.findMany({include:{voucher:true}});for(const x of ex){if(await has('EXPENSE',x.id)){skipped++;continue}try{await postJournal({date:x.date,description:`Expense ${x.voucher?.pvNo||x.id}`,referenceType:'EXPENSE',referenceId:x.id,referenceNo:x.voucher?.pvNo||null,createdById:req.user.id,lines:[{systemCode:'OPEX',debit:x.amount},{systemCode:'BANK',credit:x.amount}]});created++}catch(e){errors.push(`${x.voucher?.pvNo||x.id}: ${e.message}`)}}
  await audit(req.user.id,'SYNC_OPERATIONAL_TO_GL','ACCOUNTING',null,{created,skipped,errorCount:errors.length},req.ip);res.json({created,skipped,errors:errors.slice(0,100)});
}catch(e){res.status(400).json({message:e.message})}});

export default r;
