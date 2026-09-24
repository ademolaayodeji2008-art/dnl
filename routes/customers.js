import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo } from '../src/utils.js';

const r=Router();
r.use(auth);

async function customerPosition(customerId){
  const [c,inv,pay,ret,refund]=await Promise.all([
    prisma.customer.findUnique({where:{id:customerId}}),
    prisma.salesInvoice.aggregate({where:{customerId,status:{not:'CANCELLED'}},_sum:{totalAmount:true}}),
    prisma.salesPayment.aggregate({where:{customerId},_sum:{amount:true}}),
    prisma.salesReturn.aggregate({where:{customerId},_sum:{creditAmount:true}}),
    prisma.customerRefund.aggregate({where:{customerId},_sum:{amount:true}})
  ]);
  if(!c) return null;
  const opening=Number(c.openingBalance||0),invoiced=Number(inv._sum.totalAmount||0),paid=Number(pay._sum.amount||0),returns=Number(ret._sum.creditAmount||0),refunds=Number(refund._sum.amount||0);
  return {opening,invoiced,paid,returns,refunds,balance:opening+invoiced-paid-returns+refunds};
}

r.get('/',permit('CUSTOMER_VIEW'),async(req,res)=>{
  const rows=await prisma.customer.findMany({orderBy:{name:'asc'}});
  const out=[];
  for(const c of rows){out.push({...c,creditLimit:Number(c.creditLimit),openingBalance:Number(c.openingBalance),position:await customerPosition(c.id)});}
  res.json({rows:out,count:out.length});
});

r.post('/',permit('CUSTOMER_CREATE'),async(req,res)=>{
  const name=String(req.body.name||'').trim();
  if(!name) return res.status(400).json({message:'Customer name is required.'});
  const customerCode=String(req.body.customerCode||'').trim().toUpperCase() || (await nextSequenceNo('CUSTOMER','CUS',5)).replaceAll('/','-');
  const openingBalance=Number(req.body.openingBalance||0);
  const row=await prisma.customer.create({data:{
    customerCode,name,phone:String(req.body.phone||'').trim()||null,email:String(req.body.email||'').trim().toLowerCase()||null,
    address:String(req.body.address||'').trim()||null,creditLimit:Number(req.body.creditLimit||0),creditDays:Math.max(0,Number(req.body.creditDays||0)),creditHold:!!req.body.creditHold,openingBalance,
    openingBalanceDate:req.body.openingBalanceDate?new Date(req.body.openingBalanceDate):openingBalance?new Date():null,
    createdById:req.user.id
  }});
  await audit(req.user.id,'CREATE_CUSTOMER','CUSTOMER',row.id,{customerCode:row.customerCode,name:row.name,openingBalance},req.ip);
  res.json(row);
});

r.put('/:id',permit('CUSTOMER_EDIT'),async(req,res)=>{
  const found=await prisma.customer.findUnique({where:{id:req.params.id}});
  if(!found) return res.status(404).json({message:'Customer not found.'});
  const data={};
  for(const k of ['name','phone','email','address']) if(req.body[k]!==undefined) data[k]=String(req.body[k]||'').trim()||null;
  if(req.body.creditLimit!==undefined)data.creditLimit=Number(req.body.creditLimit||0);
  if(req.body.creditDays!==undefined)data.creditDays=Math.max(0,Number(req.body.creditDays||0));
  if(req.body.creditHold!==undefined)data.creditHold=!!req.body.creditHold;
  if(req.body.active!==undefined)data.active=!!req.body.active;
  const row=await prisma.customer.update({where:{id:req.params.id},data});
  await audit(req.user.id,'UPDATE_CUSTOMER','CUSTOMER',row.id,data,req.ip);
  res.json(row);
});

r.get('/:id/statement',permit('RECEIVABLE_VIEW'),async(req,res)=>{
  const customer=await prisma.customer.findUnique({where:{id:req.params.id}});
  if(!customer)return res.status(404).json({message:'Customer not found.'});
  const [invoices,payments,cheques,returns,refunds]=await Promise.all([
    prisma.salesInvoice.findMany({where:{customerId:customer.id},orderBy:{invoiceDate:'asc'}}),
    prisma.salesPayment.findMany({where:{customerId:customer.id},orderBy:{paymentDate:'asc'}}),
    prisma.customerCheque.findMany({where:{customerId:customer.id},orderBy:{dateReceived:'asc'}}),
    prisma.salesReturn.findMany({where:{customerId:customer.id},orderBy:{returnDate:'asc'}}),
    prisma.customerRefund.findMany({where:{customerId:customer.id},orderBy:{refundDate:'asc'}})
  ]);
  const entries=[];
  if(Number(customer.openingBalance)!==0)entries.push({date:customer.openingBalanceDate||customer.createdAt,type:'OPENING',reference:'OPENING',debit:Number(customer.openingBalance),credit:0});
  for(const x of invoices.filter(x=>x.status!=='CANCELLED')) entries.push({date:x.invoiceDate,type:'INVOICE',reference:x.invoiceNo,debit:Number(x.totalAmount),credit:0,status:x.status});
  for(const x of payments) entries.push({date:x.paymentDate,type:'PAYMENT',reference:x.paymentNo,debit:0,credit:Number(x.amount),method:x.method});
  for(const x of returns) entries.push({date:x.returnDate,type:'CREDIT NOTE / SALES RETURN',reference:x.returnNo,debit:0,credit:Number(x.creditAmount),reason:x.reason});
  for(const x of refunds) entries.push({date:x.refundDate,type:'CUSTOMER REFUND',reference:x.refundNo,debit:Number(x.amount),credit:0});
  entries.sort((a,b)=>new Date(a.date)-new Date(b.date));
  let balance=0;for(const e of entries){balance+=e.debit-e.credit;e.balance=balance;}
  res.json({customer:{...customer,creditLimit:Number(customer.creditLimit),openingBalance:Number(customer.openingBalance)},entries,cheques:cheques.map(x=>({...x,amount:Number(x.amount)})),balance});
});

export default r;
