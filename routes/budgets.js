import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth,permit } from '../src/middleware.js';
import { audit,nextSequenceNo } from '../src/utils.js';
import { num,round2 } from '../src/accounting.js';

const r=Router();
r.use(auth);

r.get('/',permit('BUDGET_VIEW'),async(req,res)=>{
  const rows=await prisma.budget.findMany({include:{lines:{include:{account:true}}},orderBy:{startDate:'desc'}});
  res.json(rows.map(x=>({...x,lines:x.lines.map(l=>({...l,amount:num(l.amount)}))})));
});

r.post('/',permit('BUDGET_MANAGE'),async(req,res)=>{try{
  const name=String(req.body.name||'').trim();
  const startDate=new Date(req.body.startDate),endDate=new Date(req.body.endDate);
  if(!name||Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())||startDate>endDate)throw new Error('Budget name and valid period are required.');
  const lines=Array.isArray(req.body.lines)?req.body.lines:[];
  if(!lines.length)throw new Error('Add at least one budget line.');
  const budgetNo=await nextSequenceNo('BUDGET','BDG',6);
  const status=String(req.body.status||'DRAFT').toUpperCase();
  if(!['DRAFT','ACTIVE','CLOSED'].includes(status))throw new Error('Invalid budget status.');
  const row=await prisma.budget.create({data:{budgetNo,name,startDate,endDate,status,notes:String(req.body.notes||'').trim()||null,createdById:req.user.id,lines:{create:lines.map((x,i)=>({lineNo:i+1,accountId:x.accountId,amount:round2(x.amount),notes:String(x.notes||'').trim()||null}))}},include:{lines:{include:{account:true}}}});
  await audit(req.user.id,'CREATE_BUDGET','BUDGET',row.id,{budgetNo,name},req.ip);
  res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.put('/:id/status',permit('BUDGET_MANAGE'),async(req,res)=>{try{
  const status=String(req.body.status||'').toUpperCase();
  if(!['DRAFT','ACTIVE','CLOSED'].includes(status))throw new Error('Invalid budget status.');
  const row=await prisma.budget.update({where:{id:req.params.id},data:{status}});
  await audit(req.user.id,'SET_BUDGET_STATUS','BUDGET',row.id,{status},req.ip);
  res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.get('/:id/variance',permit('BUDGET_VIEW'),async(req,res)=>{try{
  const b=await prisma.budget.findUnique({where:{id:req.params.id},include:{lines:{include:{account:true}}}});
  if(!b)throw new Error('Budget not found.');
  const actual=await prisma.journalLine.groupBy({by:['accountId'],where:{accountId:{in:b.lines.map(x=>x.accountId)},journalEntry:{status:'POSTED',journalDate:{gte:b.startDate,lte:b.endDate}}},_sum:{debit:true,credit:true}});
  const amap=new Map(actual.map(x=>[x.accountId,{debit:num(x._sum.debit),credit:num(x._sum.credit)}]));
  const rows=b.lines.map(l=>{
    const a=amap.get(l.accountId)||{debit:0,credit:0};
    const actualAmount=['REVENUE','LIABILITY','EQUITY'].includes(l.account.type)?round2(a.credit-a.debit):round2(a.debit-a.credit);
    const budget=round2(l.amount);
    return {account:l.account,budget,actual:actualAmount,variance:round2(actualAmount-budget),variancePct:budget?round2((actualAmount-budget)/budget*100):null};
  });
  res.json({budget:{id:b.id,budgetNo:b.budgetNo,name:b.name,startDate:b.startDate,endDate:b.endDate,status:b.status},rows,totalBudget:round2(rows.reduce((s,x)=>s+x.budget,0)),totalActual:round2(rows.reduce((s,x)=>s+x.actual,0))});
}catch(e){res.status(400).json({message:e.message})}});

export default r;
