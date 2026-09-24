import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo, setting } from '../src/utils.js';
import { assertPeriodOpen, maybeFlagBackdated } from '../src/accounting.js';

const r=Router();r.use(auth);const n=v=>Number(v||0);const r2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

async function refreshBill(tx,id){
  const bill=await tx.purchaseBill.findUnique({where:{id}});if(!bill)return null;
  const [p,dr]=await Promise.all([tx.purchasePayment.aggregate({where:{billId:id},_sum:{amount:true}}),tx.purchaseReturn.aggregate({where:{billId:id},_sum:{debitAmount:true}})]);
  const paid=r2(p._sum.amount||0),debit=r2(dr._sum.debitAmount||0),netAmount=Math.max(0,r2(n(bill.totalAmount)-debit)),outstanding=Math.max(0,r2(netAmount-paid));
  const status=outstanding<=0?'PAID':paid>0||debit>0?'PARTIALLY_PAID':'POSTED';
  await tx.purchaseBill.update({where:{id},data:{amountPaid:paid,outstanding,status}});return {paid,debit,netAmount,outstanding,status};
}



async function editableBillOrThrow(id){
  const bill=await prisma.purchaseBill.findUnique({where:{id},include:{lines:true,payments:true,returns:true}});
  if(!bill)throw new Error('Purchase bill not found.');
  if(bill.status==='CANCELLED')throw new Error('Cancelled bills cannot be edited or deleted.');
  if(n(bill.amountPaid)!==0||bill.payments.length)throw new Error('This bill is locked because a supplier payment has already been recorded.');
  if(bill.returns.length)throw new Error('This bill is locked because a supplier return/debit note has already been posted.');
  for(const l of bill.lines){
    const later=await prisma.stockMovement.findFirst({where:{itemId:l.itemId,createdAt:{gt:bill.createdAt},NOT:{AND:{referenceType:'PURCHASE_BILL',referenceId:bill.id}}},orderBy:{createdAt:'asc'}});
    if(later)throw new Error('This bill is locked because one or more purchased items already have later stock activity.');
    const item=await prisma.inventoryItem.findUnique({where:{id:l.itemId}});if(!item||n(item.currentStock)<n(l.stockQuantity))throw new Error('This bill cannot be reversed because the purchased stock is no longer fully available.');
  }
  return bill;
}

async function reverseBillStock(tx,bill){
  for(const l of bill.lines){
    const item=await tx.inventoryItem.findUnique({where:{id:l.itemId}}),curStock=n(item.currentStock),curCost=n(item.costPrice),qty=n(l.stockQuantity),baseUnitCost=n(l.unitCost)/n(l.converter||1),beforeStock=roundSafe(curStock-qty);
    const beforeCost=beforeStock>0?Math.max(0,((curStock*curCost)-(qty*baseUnitCost))/beforeStock):0;
    await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:beforeStock,costPrice:beforeCost}});
  }
  await tx.stockMovement.deleteMany({where:{referenceType:'PURCHASE_BILL',referenceId:bill.id}});
}
const roundSafe=v=>Math.round((n(v)+Number.EPSILON)*10000)/10000;

r.get('/suppliers',permit('SUPPLIER_VIEW'),async(req,res)=>{
  const rows=await prisma.supplier.findMany({orderBy:{name:'asc'}});const out=[];
  for(const s of rows){const bills=await prisma.purchaseBill.aggregate({where:{supplierId:s.id,status:{not:'CANCELLED'}},_sum:{totalAmount:true,outstanding:true}});out.push({...s,openingBalance:n(s.openingBalance),position:{billed:n(bills._sum.totalAmount),outstanding:n(s.openingBalance)+n(bills._sum.outstanding)}})}
  res.json({rows:out,count:out.length});
});

r.post('/suppliers',permit('SUPPLIER_CREATE'),async(req,res)=>{try{
  const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({message:'Supplier name is required.'});
  const supplierCode=String(req.body.supplierCode||'').trim().toUpperCase()||(await nextSequenceNo('SUPPLIER','SUP',5)).replaceAll('/','-');
  const openingBalance=r2(req.body.openingBalance||0);
  const row=await prisma.supplier.create({data:{supplierCode,name,phone:String(req.body.phone||'').trim()||null,email:String(req.body.email||'').trim().toLowerCase()||null,address:String(req.body.address||'').trim()||null,openingBalance,openingBalanceDate:req.body.openingBalanceDate?new Date(req.body.openingBalanceDate):openingBalance?new Date():null,creditDays:Math.max(0,Number(req.body.creditDays||0)),createdById:req.user.id}});
  await audit(req.user.id,'CREATE_SUPPLIER','SUPPLIER',row.id,{supplierCode,name,openingBalance},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.put('/suppliers/:id',permit('SUPPLIER_EDIT'),async(req,res)=>{try{
  const current=await prisma.supplier.findUnique({where:{id:req.params.id}});if(!current)return res.status(404).json({message:'Supplier not found.'});
  const name=String(req.body.name??current.name).trim();if(!name)return res.status(400).json({message:'Supplier name is required.'});
  const data={name,phone:String(req.body.phone??current.phone??'').trim()||null,email:String(req.body.email??current.email??'').trim().toLowerCase()||null,address:String(req.body.address??current.address??'').trim()||null,creditDays:req.body.creditDays===undefined?current.creditDays:Math.max(0,Number(req.body.creditDays||0)),active:req.body.active===undefined?current.active:!!req.body.active};
  const row=await prisma.supplier.update({where:{id:req.params.id},data});
  await audit(req.user.id,'UPDATE_SUPPLIER','SUPPLIER',row.id,{supplierCode:row.supplierCode,name:row.name,active:row.active},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.get('/bills',permit('PURCHASE_VIEW'),async(req,res)=>{
  const rows=await prisma.purchaseBill.findMany({include:{supplier:true,lines:{include:{item:true}},payments:{include:{bank:true}}},orderBy:{billDate:'desc'},take:1500});
  const out=[];for(const x of rows){let editable=x.status!=='CANCELLED'&&n(x.amountPaid)===0&&x.payments.length===0;if(editable){for(const l of x.lines){const later=await prisma.stockMovement.findFirst({where:{itemId:l.itemId,createdAt:{gt:x.createdAt},NOT:{AND:{referenceType:'PURCHASE_BILL',referenceId:x.id}}}});if(later){editable=false;break}}}out.push({...x,editable,subtotal:n(x.subtotal),discountAmount:n(x.discountAmount),vatAmount:n(x.vatAmount),totalAmount:n(x.totalAmount),amountPaid:n(x.amountPaid),outstanding:n(x.outstanding),lines:x.lines.map(l=>({...l,quantity:n(l.quantity),converter:n(l.converter),stockQuantity:n(l.stockQuantity),unitCost:n(l.unitCost),amount:n(l.amount),vatAmount:n(l.vatAmount),grossAmount:n(l.grossAmount)})),payments:x.payments.map(p=>({...p,amount:n(p.amount)}))})}res.json(out);
});

r.post('/bills',permit('PURCHASE_CREATE'),async(req,res)=>{try{
  const supplier=await prisma.supplier.findUnique({where:{id:String(req.body.supplierId||'')}});if(!supplier||!supplier.active)throw new Error('Select an active supplier.');
  const raw=Array.isArray(req.body.lines)?req.body.lines:[];if(!raw.length)throw new Error('At least one purchase line is required.');
  const lines=[];let subtotal=0,vatAmount=0;
  for(let i=0;i<raw.length;i++){
    const x=raw[i],item=await prisma.inventoryItem.findUnique({where:{id:String(x.itemId||'')}});if(!item)throw new Error('Purchase item not found.');
    const locationId=String(x.locationId||'');const loc=await prisma.inventoryLocation.findUnique({where:{id:locationId}});if(!loc||!loc.active)throw new Error(`Select an active receiving location for ${item.name}.`);const quantity=n(x.quantity),converter=n(x.converter||1),unitCost=n(x.unitCost),vat=r2(x.vatAmount||0);if(quantity<=0||converter<=0||unitCost<0)throw new Error(`Invalid purchase values for ${item.name}.`);
    const amount=r2(quantity*unitCost),stockQuantity=quantity*converter,grossAmount=r2(amount+vat);subtotal+=amount;vatAmount+=vat;
    lines.push({lineNo:i+1,item,locationId,purchaseUnit:String(x.purchaseUnit||item.baseUnit).toUpperCase(),quantity,converter,stockQuantity,unitCost,amount,vatAmount:vat,grossAmount});
  }
  const discountAmount=r2(req.body.discountAmount||0),totalAmount=r2(subtotal-discountAmount+vatAmount);if(totalAmount<0)throw new Error('Bill total cannot be negative.');
  const billDate=req.body.billDate?new Date(req.body.billDate):new Date();await assertPeriodOpen(billDate);const threshold=Number(await setting('PURCHASE_APPROVAL_THRESHOLD','0'))||0;if(threshold>0&&totalAmount>=threshold&&!req.permissions.includes('CONTROL_APPROVE')&&!req.roles.includes('SUPER_ADMIN'))throw new Error(`Purchase amount requires authorized approval because it meets the ₦${threshold.toLocaleString()} threshold.`);
  const billNo=await nextSequenceNo('PURCHASE_BILL','BILL',6),movementNos=[];for(const _ of lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
  const result=await prisma.$transaction(async tx=>{
    const bill=await tx.purchaseBill.create({data:{billNo,supplierId:supplier.id,supplierInvoiceNo:String(req.body.supplierInvoiceNo||'').trim()||null,billDate,dueDate:req.body.dueDate?new Date(req.body.dueDate):(Number(supplier.creditDays||0)?new Date(billDate.getTime()+Number(supplier.creditDays)*86400000):null),subtotal:r2(subtotal),discountAmount,vatAmount:r2(vatAmount),totalAmount,amountPaid:0,outstanding:totalAmount,notes:String(req.body.notes||'').trim()||null,createdById:req.user.id}});
    for(let i=0;i<lines.length;i++){const l=lines[i];await tx.purchaseBillLine.create({data:{billId:bill.id,lineNo:l.lineNo,itemId:l.item.id,locationId:l.locationId,purchaseUnit:l.purchaseUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitCost:l.unitCost,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});const oldStock=n(l.item.currentStock),oldCost=n(l.item.costPrice),baseUnitCost=l.unitCost/l.converter,newStock=oldStock+l.stockQuantity,weightedCost=newStock>0?((oldStock*oldCost)+(l.stockQuantity*baseUnitCost))/newStock:baseUnitCost;await tx.inventoryItem.update({where:{id:l.item.id},data:{currentStock:{increment:l.stockQuantity},costPrice:weightedCost}});await tx.inventoryLocationBalance.upsert({where:{locationId_itemId:{locationId:l.locationId,itemId:l.item.id}},update:{quantity:{increment:l.stockQuantity}},create:{locationId:l.locationId,itemId:l.item.id,quantity:l.stockQuantity}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:bill.billDate,itemId:l.item.id,locationId:l.locationId,type:'PURCHASE',quantity:l.quantity,unit:l.purchaseUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'PURCHASE_BILL',referenceId:bill.id,referenceNo:billNo,remarks:`Purchase from ${supplier.name}`,createdById:req.user.id}})}
    return bill;
  });
  await audit(req.user.id,'CREATE_PURCHASE_BILL','PURCHASE_BILL',result.id,{billNo,supplier:supplier.name,totalAmount,lines:lines.length},req.ip);await maybeFlagBackdated({entity:'PURCHASE_BILL',entityId:result.id,transactionDate:result.billDate,label:`purchase bill ${billNo}`});res.json(result);
}catch(e){res.status(400).json({message:e.message})}});



r.put('/bills/:id',permit('PURCHASE_EDIT'),async(req,res)=>{try{
  const current=await editableBillOrThrow(req.params.id),supplier=await prisma.supplier.findUnique({where:{id:String(req.body.supplierId||current.supplierId)}});if(!supplier||!supplier.active)throw new Error('Select an active supplier.');
  const raw=Array.isArray(req.body.lines)?req.body.lines:[];if(!raw.length)throw new Error('At least one purchase line is required.');
  const lines=[];let subtotal=0,vatAmount=0;for(let i=0;i<raw.length;i++){const x=raw[i],item=await prisma.inventoryItem.findUnique({where:{id:String(x.itemId||'')}});if(!item)throw new Error('Purchase item not found.');const locationId=String(x.locationId||'');const loc=await prisma.inventoryLocation.findUnique({where:{id:locationId}});if(!loc||!loc.active)throw new Error(`Select an active receiving location for ${item.name}.`);const quantity=n(x.quantity),converter=n(x.converter||1),unitCost=n(x.unitCost),vat=r2(x.vatAmount||0);if(quantity<=0||converter<=0||unitCost<0)throw new Error(`Invalid purchase values for ${item.name}.`);const amount=r2(quantity*unitCost),stockQuantity=quantity*converter,grossAmount=r2(amount+vat);subtotal+=amount;vatAmount+=vat;lines.push({lineNo:i+1,item,locationId,purchaseUnit:String(x.purchaseUnit||item.baseUnit).toUpperCase(),quantity,converter,stockQuantity,unitCost,amount,vatAmount:vat,grossAmount})}
  const discountAmount=r2(req.body.discountAmount||0),totalAmount=r2(subtotal-discountAmount+vatAmount);if(totalAmount<0)throw new Error('Bill total cannot be negative.');const newBillDate=req.body.billDate?new Date(req.body.billDate):current.billDate;await assertPeriodOpen(current.billDate);await assertPeriodOpen(newBillDate);const threshold=Number(await setting('PURCHASE_APPROVAL_THRESHOLD','0'))||0;if(threshold>0&&totalAmount>=threshold&&!req.permissions.includes('CONTROL_APPROVE')&&!req.roles.includes('SUPER_ADMIN'))throw new Error(`Purchase amount requires authorized approval because it meets the ₦${threshold.toLocaleString()} threshold.`);const movementNos=[];for(const _ of lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
  const result=await prisma.$transaction(async tx=>{await reverseBillStock(tx,current);await tx.purchaseBillLine.deleteMany({where:{billId:current.id}});const bill=await tx.purchaseBill.update({where:{id:current.id},data:{supplierId:supplier.id,supplierInvoiceNo:String(req.body.supplierInvoiceNo??current.supplierInvoiceNo??'').trim()||null,billDate:newBillDate,dueDate:req.body.dueDate?new Date(req.body.dueDate):(Number(supplier.creditDays||0)?new Date(newBillDate.getTime()+Number(supplier.creditDays)*86400000):null),subtotal:r2(subtotal),discountAmount,vatAmount:r2(vatAmount),totalAmount,amountPaid:0,outstanding:totalAmount,status:'POSTED',notes:String(req.body.notes??current.notes??'').trim()||null}});for(let i=0;i<lines.length;i++){const l=lines[i],fresh=await tx.inventoryItem.findUnique({where:{id:l.item.id}}),oldStock=n(fresh.currentStock),oldCost=n(fresh.costPrice),baseUnitCost=l.unitCost/l.converter,newStock=oldStock+l.stockQuantity,weightedCost=newStock>0?((oldStock*oldCost)+(l.stockQuantity*baseUnitCost))/newStock:baseUnitCost;await tx.purchaseBillLine.create({data:{billId:bill.id,lineNo:l.lineNo,itemId:l.item.id,locationId:l.locationId,purchaseUnit:l.purchaseUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitCost:l.unitCost,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});await tx.inventoryItem.update({where:{id:l.item.id},data:{currentStock:{increment:l.stockQuantity},costPrice:weightedCost}});await tx.inventoryLocationBalance.upsert({where:{locationId_itemId:{locationId:l.locationId,itemId:l.item.id}},update:{quantity:{increment:l.stockQuantity}},create:{locationId:l.locationId,itemId:l.item.id,quantity:l.stockQuantity}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:bill.billDate,itemId:l.item.id,locationId:l.locationId,type:'PURCHASE',quantity:l.quantity,unit:l.purchaseUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'PURCHASE_BILL',referenceId:bill.id,referenceNo:bill.billNo,remarks:`Edited purchase from ${supplier.name}`,createdById:req.user.id}})}return bill});
  await audit(req.user.id,'UPDATE_PURCHASE_BILL','PURCHASE_BILL',result.id,{billNo:result.billNo,totalAmount},req.ip);res.json(result);
}catch(e){res.status(400).json({message:e.message})}});

r.delete('/bills/:id',permit('PURCHASE_DELETE'),async(req,res)=>{try{
  const bill=await editableBillOrThrow(req.params.id);await assertPeriodOpen(bill.billDate);await prisma.$transaction(async tx=>{await reverseBillStock(tx,bill);await tx.purchaseBill.delete({where:{id:bill.id}})});await audit(req.user.id,'DELETE_PURCHASE_BILL','PURCHASE_BILL',bill.id,{billNo:bill.billNo,totalAmount:n(bill.totalAmount)},req.ip);res.json({message:'Purchase bill deleted and received stock reversed.'});
}catch(e){res.status(400).json({message:e.message})}});

r.post('/bills/:id/payments',permit('PURCHASE_PAY'),async(req,res)=>{try{
  const bill=await prisma.purchaseBill.findUnique({where:{id:req.params.id}});if(!bill||bill.status==='CANCELLED')return res.status(404).json({message:'Active bill not found.'});
  const bank=await prisma.companyBank.findUnique({where:{id:String(req.body.bankId||'')}});if(!bank||!bank.active)throw new Error('Select an active company bank account.');
  const amount=r2(req.body.amount);if(amount<=0||amount>n(bill.outstanding))throw new Error('Payment must be greater than zero and not exceed the outstanding amount.');if(amount>n(bank.currentBalance))throw new Error('Insufficient bank balance.');const paymentDate=req.body.paymentDate?new Date(req.body.paymentDate):new Date();await assertPeriodOpen(paymentDate);const threshold=Number(await setting('PAYMENT_APPROVAL_THRESHOLD','0'))||0;if(threshold>0&&amount>=threshold&&!req.permissions.includes('CONTROL_APPROVE')&&!req.roles.includes('SUPER_ADMIN'))throw new Error(`Payment requires authorized approval because it meets the ₦${threshold.toLocaleString()} threshold.`);
  const paymentNo=await nextSequenceNo('PURCHASE_PAYMENT','PPAY',6),txnNo=await nextSequenceNo('BANK_TXN','BTX',7);
  const result=await prisma.$transaction(async tx=>{const p=await tx.purchasePayment.create({data:{paymentNo,paymentDate,supplierId:bill.supplierId,billId:bill.id,bankId:bank.id,amount,reference:String(req.body.reference||'').trim()||null,remarks:String(req.body.remarks||'').trim()||null,paidById:req.user.id}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{decrement:amount}}});await tx.bankTransaction.create({data:{transactionNo:txnNo,transactionDate:paymentDate,bankId:bank.id,type:'WITHDRAWAL',amount,referenceType:'PURCHASE_PAYMENT',referenceId:p.id,referenceNo:paymentNo,narration:`Supplier payment ${bill.billNo}`,createdById:req.user.id}});const pos=await refreshBill(tx,bill.id);return {payment:p,position:pos}});
  await audit(req.user.id,'PAY_PURCHASE_BILL','PURCHASE_BILL',bill.id,{paymentNo,amount,bankId:bank.id},req.ip);res.json(result);
}catch(e){res.status(400).json({message:e.message})}});

r.get('/suppliers/:id/statement',permit('PURCHASE_VIEW'),async(req,res)=>{
  const s=await prisma.supplier.findUnique({where:{id:req.params.id}});if(!s)return res.status(404).json({message:'Supplier not found.'});const [bills,payments,returns,refunds]=await Promise.all([prisma.purchaseBill.findMany({where:{supplierId:s.id},orderBy:{billDate:'asc'}}),prisma.purchasePayment.findMany({where:{supplierId:s.id},include:{bank:true},orderBy:{paymentDate:'asc'}}),prisma.purchaseReturn.findMany({where:{supplierId:s.id},orderBy:{returnDate:'asc'}}),prisma.supplierRefund.findMany({where:{supplierId:s.id},include:{bank:true},orderBy:{refundDate:'asc'}})]);const entries=[];if(n(s.openingBalance)!==0)entries.push({date:s.openingBalanceDate||s.createdAt,type:'OPENING',reference:'OPENING',credit:n(s.openingBalance),debit:0});for(const x of bills.filter(x=>x.status!=='CANCELLED'))entries.push({date:x.billDate,type:'BILL',reference:x.billNo,credit:n(x.totalAmount),debit:0});for(const x of payments)entries.push({date:x.paymentDate,type:'PAYMENT',reference:x.paymentNo,credit:0,debit:n(x.amount),bank:x.bank.bankName});for(const x of returns)entries.push({date:x.returnDate,type:'DEBIT NOTE / PURCHASE RETURN',reference:x.returnNo,credit:0,debit:n(x.debitAmount),reason:x.reason});for(const x of refunds)entries.push({date:x.refundDate,type:'SUPPLIER REFUND RECEIVED',reference:x.refundNo,credit:n(x.amount),debit:0,bank:x.bank.bankName});entries.sort((a,b)=>new Date(a.date)-new Date(b.date));let balance=0;for(const e of entries){balance+=e.credit-e.debit;e.balance=balance}res.json({supplier:{...s,openingBalance:n(s.openingBalance)},entries,balance});
});

export default r;
