import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth,permit } from '../src/middleware.js';
import { audit,nextSequenceNo } from '../src/utils.js';
import { round2,num,assertPeriodOpen } from '../src/accounting.js';

const r=Router();r.use(auth);
const dayStart=x=>new Date(String(x)+'T00:00:00');const dayEnd=x=>new Date(String(x)+'T23:59:59.999');
function signedBook(t){return ['DEPOSIT','TRANSFER_IN','OPENING'].includes(t.type)?num(t.amount):-num(t.amount)}

r.get('/',permit('BANK_RECON_VIEW'),async(req,res)=>{
  const where={};if(req.query.bankId)where.bankId=req.query.bankId;
  const rows=await prisma.bankReconciliation.findMany({where,include:{bank:true,statementEntries:true},orderBy:{statementEndDate:'desc'},take:500});
  res.json(rows.map(x=>({...x,statementOpeningBalance:num(x.statementOpeningBalance),statementClosingBalance:num(x.statementClosingBalance),matched:x.statementEntries.filter(e=>e.status==='MATCHED').length,unmatched:x.statementEntries.filter(e=>e.status==='UNMATCHED').length})));
});

r.post('/',permit('BANK_RECON_CREATE'),async(req,res)=>{try{
  const bank=await prisma.companyBank.findUnique({where:{id:String(req.body.bankId||'')}});if(!bank)throw new Error('Bank account not found.');
  const start=dayStart(req.body.statementStartDate),end=dayEnd(req.body.statementEndDate);if(!(start<=end))throw new Error('Valid statement dates are required.');
  const reconciliationNo=await nextSequenceNo('BANK_RECON','BRC',6);const entries=Array.isArray(req.body.entries)?req.body.entries:[];
  const row=await prisma.bankReconciliation.create({data:{reconciliationNo,bankId:bank.id,statementStartDate:start,statementEndDate:end,statementOpeningBalance:round2(req.body.statementOpeningBalance),statementClosingBalance:round2(req.body.statementClosingBalance),notes:String(req.body.notes||'').trim()||null,preparedById:req.user.id,statementEntries:{create:entries.map((e,i)=>({lineNo:i+1,transactionDate:e.transactionDate?new Date(e.transactionDate):start,description:String(e.description||'Statement entry'),reference:String(e.reference||'').trim()||null,debit:round2(e.debit),credit:round2(e.credit),balance:e.balance===undefined||e.balance===null||e.balance===''?null:round2(e.balance)}))}},include:{statementEntries:true,bank:true}});
  await audit(req.user.id,'CREATE_BANK_RECONCILIATION','BANK_RECONCILIATION',row.id,{reconciliationNo,bankId:bank.id,entries:entries.length},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});


r.post('/:id/entries',permit('BANK_RECON_MANAGE'),async(req,res)=>{try{
  const rec=await prisma.bankReconciliation.findUnique({where:{id:req.params.id},include:{statementEntries:true}});
  if(!rec||rec.status!=='DRAFT')throw new Error('Only draft reconciliations can receive statement entries.');
  const entries=Array.isArray(req.body.entries)?req.body.entries:[];if(!entries.length)throw new Error('Add at least one statement entry.');
  const next=(rec.statementEntries.reduce((m,x)=>Math.max(m,x.lineNo),0)||0)+1;
  await prisma.bankStatementEntry.createMany({data:entries.map((e,i)=>({reconciliationId:rec.id,lineNo:next+i,transactionDate:e.transactionDate?new Date(e.transactionDate):rec.statementStartDate,description:String(e.description||'Statement entry'),reference:String(e.reference||'').trim()||null,debit:round2(e.debit),credit:round2(e.credit),balance:e.balance===undefined||e.balance===null||e.balance===''?null:round2(e.balance)}))});
  await audit(req.user.id,'ADD_BANK_RECON_ENTRIES','BANK_RECONCILIATION',rec.id,{count:entries.length},req.ip);
  res.json({message:`${entries.length} statement entr${entries.length===1?'y':'ies'} added.`});
}catch(e){res.status(400).json({message:e.message})}});

r.get('/:id',permit('BANK_RECON_VIEW'),async(req,res)=>{
  const rec=await prisma.bankReconciliation.findUnique({where:{id:req.params.id},include:{bank:true,statementEntries:{include:{matchedBankTransaction:true},orderBy:{lineNo:'asc'}}}});if(!rec)return res.status(404).json({message:'Reconciliation not found.'});
  const txns=await prisma.bankTransaction.findMany({where:{bankId:rec.bankId,transactionDate:{gte:rec.statementStartDate,lte:rec.statementEndDate}},orderBy:{transactionDate:'asc'}});
  const matchedIds=new Set(rec.statementEntries.filter(x=>x.matchedBankTransactionId).map(x=>x.matchedBankTransactionId));
  const openingTx=await prisma.bankTransaction.findMany({where:{bankId:rec.bankId,transactionDate:{lt:rec.statementStartDate}}});const bookOpening=round2(num(rec.bank.openingBalance)+openingTx.filter(x=>x.type!=='OPENING').reduce((s,x)=>s+signedBook(x),0));
  const bookMovement=round2(txns.reduce((s,x)=>s+signedBook(x),0)),bookClosing=round2(bookOpening+bookMovement);
  const unmatchedBook=txns.filter(x=>!matchedIds.has(x.id));const unmatchedStatement=rec.statementEntries.filter(x=>x.status==='UNMATCHED');
  const statementNet=round2(num(rec.statementClosingBalance)-num(rec.statementOpeningBalance));
  res.json({...rec,statementOpeningBalance:num(rec.statementOpeningBalance),statementClosingBalance:num(rec.statementClosingBalance),bookOpening,bookMovement,bookClosing,statementNet,difference:round2(num(rec.statementClosingBalance)-bookClosing),transactions:txns.map(x=>({...x,amount:num(x.amount),matched:matchedIds.has(x.id)})),unmatchedBook:unmatchedBook.map(x=>({...x,amount:num(x.amount)})),unmatchedStatement:unmatchedStatement.map(x=>({...x,debit:num(x.debit),credit:num(x.credit),balance:x.balance===null?null:num(x.balance)}))});
});

r.post('/:id/auto-match',permit('BANK_RECON_MANAGE'),async(req,res)=>{try{
  const rec=await prisma.bankReconciliation.findUnique({where:{id:req.params.id},include:{statementEntries:true}});if(!rec||rec.status!=='DRAFT')throw new Error('Only draft reconciliations can be matched.');
  const txns=await prisma.bankTransaction.findMany({where:{bankId:rec.bankId,transactionDate:{gte:rec.statementStartDate,lte:rec.statementEndDate}}});
  const used=new Set(rec.statementEntries.filter(x=>x.matchedBankTransactionId).map(x=>x.matchedBankTransactionId));let matched=0;
  for(const e of rec.statementEntries.filter(x=>x.status==='UNMATCHED')){
    const statementAmount=round2(num(e.credit)-num(e.debit));
    const candidates=txns.filter(t=>!used.has(t.id)&&Math.abs(signedBook(t)-statementAmount)<=0.01&&Math.abs(new Date(t.transactionDate)-new Date(e.transactionDate))<=3*86400000);
    let pick=candidates.find(t=>e.reference&&(String(t.referenceNo||'').toLowerCase().includes(String(e.reference).toLowerCase())||String(t.narration||'').toLowerCase().includes(String(e.reference).toLowerCase())))||candidates[0];
    if(pick){await prisma.bankStatementEntry.update({where:{id:e.id},data:{status:'MATCHED',matchedBankTransactionId:pick.id,matchNote:'Auto matched by amount/date/reference'}});used.add(pick.id);matched++;}
  }
  await audit(req.user.id,'AUTO_MATCH_BANK_RECON','BANK_RECONCILIATION',rec.id,{matched},req.ip);res.json({matched});
}catch(e){res.status(400).json({message:e.message})}});

r.post('/:id/match',permit('BANK_RECON_MANAGE'),async(req,res)=>{try{
  const e=await prisma.bankStatementEntry.findUnique({where:{id:String(req.body.statementEntryId||'')}});const t=await prisma.bankTransaction.findUnique({where:{id:String(req.body.bankTransactionId||'')}});if(!e||!t||e.reconciliationId!==req.params.id)throw new Error('Statement entry or bank transaction not found.');
  const row=await prisma.bankStatementEntry.update({where:{id:e.id},data:{status:'MATCHED',matchedBankTransactionId:t.id,matchNote:String(req.body.note||'Manual match').trim()}});await audit(req.user.id,'MATCH_BANK_RECON_ITEM','BANK_RECONCILIATION',req.params.id,{statementEntryId:e.id,bankTransactionId:t.id},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});
r.post('/:id/entries/:entryId/exclude',permit('BANK_RECON_MANAGE'),async(req,res)=>{try{const row=await prisma.bankStatementEntry.update({where:{id:req.params.entryId},data:{status:'EXCLUDED',matchedBankTransactionId:null,matchNote:String(req.body.note||'Excluded from reconciliation').trim()}});res.json(row)}catch(e){res.status(400).json({message:e.message})}});
r.post('/:id/complete',permit('BANK_RECON_COMPLETE'),async(req,res)=>{try{
  const rec=await prisma.bankReconciliation.findUnique({where:{id:req.params.id},include:{statementEntries:true}});if(!rec)throw new Error('Reconciliation not found.');await assertPeriodOpen(rec.statementEndDate);
  const remaining=rec.statementEntries.filter(x=>x.status==='UNMATCHED').length;if(remaining)throw new Error(`${remaining} statement item(s) remain unmatched. Match or explicitly exclude them before completion.`);
  const row=await prisma.bankReconciliation.update({where:{id:rec.id},data:{status:'COMPLETED',completedById:req.user.id,completedAt:new Date()}});await audit(req.user.id,'COMPLETE_BANK_RECONCILIATION','BANK_RECONCILIATION',rec.id,{reconciliationNo:rec.reconciliationNo},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

export default r;
