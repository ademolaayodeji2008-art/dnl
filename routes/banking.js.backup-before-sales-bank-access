import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo, setting } from '../src/utils.js';
import { assertPeriodOpen } from '../src/accounting.js';

const r=Router();
r.use(auth);
const n=v=>Number(v||0);
const round2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

r.get('/accounts',permit('BANK_VIEW'),async(req,res)=>{
  const rows=await prisma.companyBank.findMany({include:{_count:{select:{transactions:true,payments:true,cheques:true,purchasePayments:true}}},orderBy:[{active:'desc'},{bankName:'asc'}]});
  res.json(rows.map(x=>({...x,canModify:x._count.transactions===0&&x._count.payments===0&&x._count.cheques===0&&x._count.purchasePayments===0,openingBalance:n(x.openingBalance),currentBalance:n(x.currentBalance)})));
});

r.post('/accounts',permit('BANK_MANAGE'),async(req,res)=>{
  try{
    const bankName=String(req.body.bankName||'').trim(),accountNumber=String(req.body.accountNumber||'').trim(),accountName=String(req.body.accountName||'').trim();
    if(!bankName||!accountNumber||!accountName)return res.status(400).json({message:'Bank name, account number and account name are required.'});
    const openingBalance=round2(req.body.openingBalance||0),bankCode=(await nextSequenceNo('BANK','BNK',4)).replaceAll('/','-');
    const transactionNo=openingBalance!==0?await nextSequenceNo('BANK_TXN','BTX',7):null;
    const row=await prisma.$transaction(async tx=>{
      const bank=await tx.companyBank.create({data:{bankCode,bankName,accountNumber,accountName,openingBalance,currentBalance:openingBalance,createdById:req.user.id}});
      if(openingBalance!==0)await tx.bankTransaction.create({data:{transactionNo,transactionDate:new Date(),bankId:bank.id,type:'OPENING',amount:Math.abs(openingBalance),referenceType:'OPENING_BALANCE',referenceId:bank.id,referenceNo:bankCode,narration:`Opening balance — ${bankName} ${accountNumber}`,createdById:req.user.id}});
      return bank;
    });
    await audit(req.user.id,'CREATE_BANK_ACCOUNT','COMPANY_BANK',row.id,{bankCode,bankName,accountNumber,openingBalance},req.ip);
    res.json({...row,openingBalance:n(row.openingBalance),currentBalance:n(row.currentBalance)});
  }catch(e){res.status(400).json({message:e.message});}
});

r.patch('/accounts/:id',permit('BANK_MANAGE'),async(req,res)=>{
  try{const current=await prisma.companyBank.findUnique({where:{id:req.params.id},include:{_count:{select:{transactions:true,payments:true,cheques:true,purchasePayments:true}}}});if(!current)return res.status(404).json({message:'Bank account not found.'});const touched=current._count.transactions||current._count.payments||current._count.cheques||current._count.purchasePayments;if(touched)return res.status(409).json({message:'This bank account is locked because transaction activity already exists. You may deactivate it instead of changing its identity.'});const bankName=String(req.body.bankName??current.bankName).trim(),accountNumber=String(req.body.accountNumber??current.accountNumber).trim(),accountName=String(req.body.accountName??current.accountName).trim();if(!bankName||!accountNumber||!accountName)throw new Error('Bank name, account number and account name are required.');const row=await prisma.companyBank.update({where:{id:req.params.id},data:{bankName,accountNumber,accountName,active:req.body.active===undefined?current.active:!!req.body.active}});await audit(req.user.id,'UPDATE_BANK_ACCOUNT','COMPANY_BANK',row.id,{bankName:row.bankName,accountNumber:row.accountNumber,active:row.active},req.ip);res.json(row);}catch(e){res.status(400).json({message:e.message});}
});

r.delete('/accounts/:id',permit('BANK_DELETE'),async(req,res)=>{try{const current=await prisma.companyBank.findUnique({where:{id:req.params.id},include:{_count:{select:{transactions:true,payments:true,cheques:true,purchasePayments:true}}}});if(!current)return res.status(404).json({message:'Bank account not found.'});if(current._count.transactions||current._count.payments||current._count.cheques||current._count.purchasePayments)return res.status(409).json({message:'Bank account cannot be deleted after transaction activity. Deactivate it instead.'});await prisma.companyBank.delete({where:{id:current.id}});await audit(req.user.id,'DELETE_BANK_ACCOUNT','COMPANY_BANK',current.id,{bankCode:current.bankCode,bankName:current.bankName,accountNumber:current.accountNumber},req.ip);res.json({message:'Bank account deleted.'});}catch(e){res.status(400).json({message:e.message})}});


r.patch('/accounts/:id/status',permit('BANK_MANAGE'),async(req,res)=>{try{const current=await prisma.companyBank.findUnique({where:{id:req.params.id}});if(!current)return res.status(404).json({message:'Bank account not found.'});const active=!!req.body.active;const row=await prisma.companyBank.update({where:{id:current.id},data:{active}});await audit(req.user.id,'SET_BANK_STATUS','COMPANY_BANK',row.id,{active},req.ip);res.json(row);}catch(e){res.status(400).json({message:e.message})}});

r.get('/transactions',permit('BANK_VIEW'),async(req,res)=>{
  const where={};if(req.query.bankId)where.bankId=req.query.bankId;
  const rows=await prisma.bankTransaction.findMany({where,include:{bank:true},orderBy:[{transactionDate:'desc'},{createdAt:'desc'}],take:2000});
  res.json(rows.map(x=>({...x,amount:n(x.amount),bank:{...x.bank,openingBalance:n(x.bank.openingBalance),currentBalance:n(x.bank.currentBalance)}})));
});

r.post('/transactions',permit('BANK_TRANSACTION_CREATE'),async(req,res)=>{
  try{
    const bank=await prisma.companyBank.findUnique({where:{id:req.body.bankId}});if(!bank||!bank.active)return res.status(404).json({message:'Active company bank account not found.'});
    const type=String(req.body.type||'').toUpperCase();if(!['DEPOSIT','WITHDRAWAL'].includes(type))return res.status(400).json({message:'Transaction type must be DEPOSIT or WITHDRAWAL.'});
    const amount=round2(req.body.amount);if(amount<=0)return res.status(400).json({message:'Amount must be greater than zero.'});
    if(type==='WITHDRAWAL'&&amount>n(bank.currentBalance))return res.status(400).json({message:'Withdrawal exceeds current bank balance.'});
    const transactionDate=req.body.transactionDate?new Date(req.body.transactionDate):new Date();await assertPeriodOpen(transactionDate);const threshold=Number(await setting('PAYMENT_APPROVAL_THRESHOLD','0'))||0;if(type==='WITHDRAWAL'&&threshold>0&&amount>=threshold&&!req.permissions.includes('CONTROL_APPROVE')&&!req.roles.includes('SUPER_ADMIN'))throw new Error(`Withdrawal requires authorized approval because it meets the ₦${threshold.toLocaleString()} threshold.`);const transactionNo=await nextSequenceNo('BANK_TXN','BTX',7),delta=type==='DEPOSIT'?amount:-amount;
    const row=await prisma.$transaction(async tx=>{const t=await tx.bankTransaction.create({data:{transactionNo,transactionDate,bankId:bank.id,type,amount,referenceType:'MANUAL',referenceNo:String(req.body.referenceNo||'').trim()||null,narration:String(req.body.narration||'').trim()||`${type} entry`,createdById:req.user.id}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{increment:delta}}});return t;});
    await audit(req.user.id,'CREATE_BANK_TRANSACTION','BANK_TRANSACTION',row.id,{transactionNo,type,amount,bankCode:bank.bankCode},req.ip);res.json(row);
  }catch(e){res.status(400).json({message:e.message});}
});


r.post('/transfer',permit('BANK_TRANSACTION_CREATE'),async(req,res)=>{
  try{
    const fromId=String(req.body.fromBankId||''),toId=String(req.body.toBankId||'');if(!fromId||!toId||fromId===toId)return res.status(400).json({message:'Select two different bank accounts.'});
    const [fromBank,toBank]=await Promise.all([prisma.companyBank.findUnique({where:{id:fromId}}),prisma.companyBank.findUnique({where:{id:toId}})]);if(!fromBank?.active||!toBank?.active)return res.status(404).json({message:'Both bank accounts must be active.'});
    const amount=round2(req.body.amount);if(amount<=0)return res.status(400).json({message:'Transfer amount must be greater than zero.'});if(amount>n(fromBank.currentBalance))return res.status(400).json({message:'Transfer exceeds source bank balance.'});const d=req.body.transactionDate?new Date(req.body.transactionDate):new Date();await assertPeriodOpen(d);const threshold=Number(await setting('PAYMENT_APPROVAL_THRESHOLD','0'))||0;if(threshold>0&&amount>=threshold&&!req.permissions.includes('CONTROL_APPROVE')&&!req.roles.includes('SUPER_ADMIN'))throw new Error(`Bank transfer requires authorized approval because it meets the ₦${threshold.toLocaleString()} threshold.`);
    const transferRef=String(req.body.referenceNo||'').trim()||await nextSequenceNo('BANK_TRANSFER','BTR',6),outNo=await nextSequenceNo('BANK_TXN','BTX',7),inNo=await nextSequenceNo('BANK_TXN','BTX',7),note=String(req.body.narration||'').trim()||`Transfer ${fromBank.bankName} to ${toBank.bankName}`;
    const result=await prisma.$transaction(async tx=>{await tx.companyBank.update({where:{id:fromId},data:{currentBalance:{decrement:amount}}});await tx.companyBank.update({where:{id:toId},data:{currentBalance:{increment:amount}}});const out=await tx.bankTransaction.create({data:{transactionNo:outNo,transactionDate:d,bankId:fromId,type:'TRANSFER_OUT',amount,referenceType:'BANK_TRANSFER',referenceId:transferRef,referenceNo:transferRef,narration:`${note} → ${toBank.bankName} ${toBank.accountNumber}`,createdById:req.user.id}});const incoming=await tx.bankTransaction.create({data:{transactionNo:inNo,transactionDate:d,bankId:toId,type:'TRANSFER_IN',amount,referenceType:'BANK_TRANSFER',referenceId:transferRef,referenceNo:transferRef,narration:`${note} ← ${fromBank.bankName} ${fromBank.accountNumber}`,createdById:req.user.id}});return {transferRef,out,incoming}});
    await audit(req.user.id,'BANK_TRANSFER','BANK_TRANSACTION',result.out.id,{transferRef,fromBankId:fromId,toBankId:toId,amount},req.ip);res.json(result);
  }catch(e){res.status(400).json({message:e.message});}
});

r.get('/summary',permit('BANK_VIEW'),async(req,res)=>{
  const banks=await prisma.companyBank.findMany({where:{active:true},orderBy:{bankName:'asc'}});
  const totals=banks.reduce((a,b)=>{a.balance+=n(b.currentBalance);return a},{balance:0});
  res.json({count:banks.length,totalBalance:totals.balance,banks:banks.map(b=>({...b,openingBalance:n(b.openingBalance),currentBalance:n(b.currentBalance)}))});
});

export default r;
