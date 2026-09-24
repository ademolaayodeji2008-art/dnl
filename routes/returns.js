import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo } from '../src/utils.js';
import { assertPeriodOpen } from '../src/accounting.js';

const r=Router();r.use(auth);
const n=v=>Number(v||0);const r2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;const r4=v=>Math.round((n(v)+Number.EPSILON)*10000)/10000;

async function refreshInvoice(tx,invoiceId){
  const inv=await tx.salesInvoice.findUnique({where:{id:invoiceId}});if(!inv)return null;
  const [p,cr]=await Promise.all([
    tx.salesPayment.aggregate({where:{invoiceId},_sum:{amount:true}}),
    tx.salesReturn.aggregate({where:{invoiceId},_sum:{creditAmount:true}})
  ]);
  const paid=r2(p._sum.amount),credit=r2(cr._sum.creditAmount),net=Math.max(0,r2(n(inv.totalAmount)-credit)),outstanding=Math.max(0,r2(net-paid));
  let status='ISSUED';if(outstanding<=0)status='PAID';else if(paid>0||credit>0)status='PARTIALLY_PAID';
  await tx.salesInvoice.update({where:{id:invoiceId},data:{amountPaid:paid,outstanding,status}});return {paid,credit,net,outstanding,status};
}
async function refreshBill(tx,billId){
  const bill=await tx.purchaseBill.findUnique({where:{id:billId}});if(!bill)return null;
  const [p,dr]=await Promise.all([
    tx.purchasePayment.aggregate({where:{billId},_sum:{amount:true}}),
    tx.purchaseReturn.aggregate({where:{billId},_sum:{debitAmount:true}})
  ]);
  const paid=r2(p._sum.amount),debit=r2(dr._sum.debitAmount),net=Math.max(0,r2(n(bill.totalAmount)-debit)),outstanding=Math.max(0,r2(net-paid));
  const status=outstanding<=0?'PAID':paid>0||debit>0?'PARTIALLY_PAID':'POSTED';
  await tx.purchaseBill.update({where:{id:billId},data:{amountPaid:paid,outstanding,status}});return {paid,debit,net,outstanding,status};
}

r.get('/sales/options',permit('SALES_RETURN_VIEW'),async(req,res)=>{
  const invoices=await prisma.salesInvoice.findMany({where:{status:{not:'CANCELLED'}},include:{customer:true,lines:{include:{item:true}},returns:{include:{lines:true}}},orderBy:{invoiceDate:'desc'},take:1000});
  res.json(invoices.map(inv=>({...inv,totalAmount:n(inv.totalAmount),amountPaid:n(inv.amountPaid),outstanding:n(inv.outstanding),lines:inv.lines.map(l=>{const returned=inv.returns.flatMap(x=>x.lines).filter(x=>x.invoiceLineId===l.id).reduce((a,x)=>a+n(x.quantity),0);return {...l,quantity:n(l.quantity),converter:n(l.converter),stockQuantity:n(l.stockQuantity),grossAmount:n(l.grossAmount),returnedQuantity:r4(returned),returnableQuantity:r4(n(l.quantity)-returned)}})})));
});

r.get('/sales',permit('SALES_RETURN_VIEW'),async(req,res)=>{
  const rows=await prisma.salesReturn.findMany({include:{customer:true,invoice:true,lines:{include:{item:true}},refunds:{include:{bank:true}}},orderBy:{returnDate:'desc'},take:1000});
  res.json(rows.map(x=>({...x,creditAmount:n(x.creditAmount),appliedToReceivable:n(x.appliedToReceivable),refundDue:n(x.refundDue),refundedAmount:n(x.refundedAmount),refundBalance:r2(n(x.refundDue)-n(x.refundedAmount)),lines:x.lines.map(l=>({...l,quantity:n(l.quantity),baseQuantity:n(l.baseQuantity),creditAmount:n(l.creditAmount)})),refunds:x.refunds.map(z=>({...z,amount:n(z.amount)}))})));
});

r.post('/sales',permit('SALES_RETURN_CREATE'),async(req,res)=>{try{
  const inv=await prisma.salesInvoice.findUnique({where:{id:String(req.body.invoiceId||'')},include:{customer:true,lines:{include:{item:true}},returns:{include:{lines:true}}}});if(!inv||inv.status==='CANCELLED')throw new Error('Active original invoice is required.');
  const reason=String(req.body.reason||'').trim();if(!reason)throw new Error('Return reason is required.');
  const src=Array.isArray(req.body.lines)?req.body.lines:[];if(!src.length)throw new Error('Select at least one item to return.');
  const lines=[];let creditAmount=0;const movementNos=[];
  for(const x of src){
    const line=inv.lines.find(l=>l.id===x.invoiceLineId);if(!line)throw new Error('One return line does not belong to the selected invoice.');
    const returned=inv.returns.flatMap(z=>z.lines).filter(z=>z.invoiceLineId===line.id).reduce((a,z)=>a+n(z.quantity),0),qty=r4(x.quantity),available=r4(n(line.quantity)-returned);
    if(qty<=0||qty>available)throw new Error(`${line.item.name}: return quantity must be above zero and cannot exceed ${available} ${line.saleUnit}.`);
    const condition=String(x.condition||'RESALABLE').toUpperCase();if(!['RESALABLE','DAMAGED','EXPIRED','OTHER'].includes(condition))throw new Error('Invalid return condition.');
    const baseQty=r4(qty*n(line.converter)),credit=r2((n(line.grossAmount)/n(line.quantity))*qty);creditAmount=r2(creditAmount+credit);
    lines.push({invoiceLineId:line.id,itemId:line.itemId,locationId:line.locationId,quantity:qty,unit:line.saleUnit,converter:n(line.converter),baseQuantity:baseQty,condition,creditAmount:credit,itemName:line.item.name});
    if(condition==='RESALABLE')movementNos.push(await nextSequenceNo('STOCK','STK',7));else movementNos.push(null);
  }
  const pendingPdc=await prisma.customerCheque.aggregate({where:{invoiceId:inv.id,status:{in:['HELD','PRESENTED']}},_sum:{amount:true}}),pendingPdcAmount=r2(pendingPdc._sum.amount||0),outstandingBefore=n(inv.outstanding),outstandingAfter=Math.max(0,r2(outstandingBefore-creditAmount));if(pendingPdcAmount>outstandingAfter)throw new Error(`This return would reduce the invoice below active PDC cover. Cancel/replace the pending cheque(s) first. Active PDC: NGN ${pendingPdcAmount.toLocaleString()}, revised outstanding: NGN ${outstandingAfter.toLocaleString()}.`);const appliedToReceivable=Math.min(outstandingBefore,creditAmount),refundDue=r2(creditAmount-appliedToReceivable),returnNo=await nextSequenceNo('SALES_RETURN','SRN',6),returnDate=req.body.returnDate?new Date(req.body.returnDate):new Date();await assertPeriodOpen(returnDate);
  const result=await prisma.$transaction(async tx=>{
    const ret=await tx.salesReturn.create({data:{returnNo,returnDate,invoiceId:inv.id,customerId:inv.customerId,reason,creditAmount,appliedToReceivable,refundDue,createdById:req.user.id}});
    for(let i=0;i<lines.length;i++){const l=lines[i];await tx.salesReturnLine.create({data:{salesReturnId:ret.id,invoiceLineId:l.invoiceLineId,itemId:l.itemId,quantity:l.quantity,unit:l.unit,converter:l.converter,baseQuantity:l.baseQuantity,condition:l.condition,creditAmount:l.creditAmount}});if(l.condition==='RESALABLE'){if(!l.locationId)throw new Error('Original invoice has no stock location. Assign legacy stock before processing this return.');await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{increment:l.baseQuantity}}});await tx.inventoryLocationBalance.upsert({where:{locationId_itemId:{locationId:l.locationId,itemId:l.itemId}},update:{quantity:{increment:l.baseQuantity}},create:{locationId:l.locationId,itemId:l.itemId,quantity:l.baseQuantity}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:returnDate,itemId:l.itemId,locationId:l.locationId,type:'RETURN_IN',quantity:l.quantity,unit:l.unit,converter:l.converter,baseQuantity:l.baseQuantity,referenceType:'SALES_RETURN',referenceId:ret.id,referenceNo:returnNo,remarks:`Customer return from ${inv.invoiceNo}: ${reason}`,createdById:req.user.id}})}}
    const position=await refreshInvoice(tx,inv.id);return {...ret,position};
  });
  await audit(req.user.id,'CREATE_SALES_RETURN','SALES_RETURN',result.id,{returnNo,invoiceNo:inv.invoiceNo,creditAmount,refundDue},req.ip);res.json(result);
}catch(e){res.status(400).json({message:e.message})}});

r.post('/sales/:id/refunds',permit('CUSTOMER_REFUND_CREATE'),async(req,res)=>{try{
  const ret=await prisma.salesReturn.findUnique({where:{id:req.params.id},include:{customer:true}});if(!ret)throw new Error('Sales return not found.');
  const available=r2(n(ret.refundDue)-n(ret.refundedAmount)),amount=r2(req.body.amount);if(amount<=0||amount>available)throw new Error(`Refund amount must be above zero and cannot exceed ${available.toLocaleString()}.`);
  const bank=await prisma.companyBank.findUnique({where:{id:String(req.body.bankId||'')}});if(!bank||!bank.active)throw new Error('Select an active company bank account.');if(n(bank.currentBalance)<amount)throw new Error('Selected bank has insufficient balance for this refund.');
  const refundDate=req.body.refundDate?new Date(req.body.refundDate):new Date();await assertPeriodOpen(refundDate);const refundNo=await nextSequenceNo('CUSTOMER_REFUND','CRF',6),txnNo=await nextSequenceNo('BANK_TXN','BTX',7);
  const row=await prisma.$transaction(async tx=>{const z=await tx.customerRefund.create({data:{refundNo,refundDate,salesReturnId:ret.id,customerId:ret.customerId,bankId:bank.id,amount,reference:String(req.body.reference||'').trim()||null,remarks:String(req.body.remarks||'').trim()||null,createdById:req.user.id}});await tx.salesReturn.update({where:{id:ret.id},data:{refundedAmount:{increment:amount}}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{decrement:amount}}});await tx.bankTransaction.create({data:{transactionNo:txnNo,transactionDate:refundDate,bankId:bank.id,type:'WITHDRAWAL',amount,referenceType:'CUSTOMER_REFUND',referenceId:z.id,referenceNo:refundNo,narration:`Customer refund ${ret.returnNo} - ${ret.customer.name}`,createdById:req.user.id}});return z});
  await audit(req.user.id,'CUSTOMER_REFUND','SALES_RETURN',ret.id,{refundNo,amount,bankId:bank.id},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.get('/purchases/options',permit('PURCHASE_RETURN_VIEW'),async(req,res)=>{
  const bills=await prisma.purchaseBill.findMany({where:{status:{not:'CANCELLED'}},include:{supplier:true,lines:{include:{item:true}},returns:{include:{lines:true}}},orderBy:{billDate:'desc'},take:1000});
  res.json(bills.map(b=>({...b,totalAmount:n(b.totalAmount),amountPaid:n(b.amountPaid),outstanding:n(b.outstanding),lines:b.lines.map(l=>{const returned=b.returns.flatMap(x=>x.lines).filter(x=>x.billLineId===l.id).reduce((a,x)=>a+n(x.quantity),0);return {...l,quantity:n(l.quantity),converter:n(l.converter),stockQuantity:n(l.stockQuantity),grossAmount:n(l.grossAmount),returnedQuantity:r4(returned),returnableQuantity:r4(n(l.quantity)-returned)}})})));
});

r.get('/purchases',permit('PURCHASE_RETURN_VIEW'),async(req,res)=>{
  const rows=await prisma.purchaseReturn.findMany({include:{supplier:true,bill:true,lines:{include:{item:true}},refunds:{include:{bank:true}}},orderBy:{returnDate:'desc'},take:1000});
  res.json(rows.map(x=>({...x,debitAmount:n(x.debitAmount),appliedToPayable:n(x.appliedToPayable),refundDue:n(x.refundDue),refundedAmount:n(x.refundedAmount),refundBalance:r2(n(x.refundDue)-n(x.refundedAmount)),lines:x.lines.map(l=>({...l,quantity:n(l.quantity),baseQuantity:n(l.baseQuantity),debitAmount:n(l.debitAmount)})),refunds:x.refunds.map(z=>({...z,amount:n(z.amount)}))})));
});

r.post('/purchases',permit('PURCHASE_RETURN_CREATE'),async(req,res)=>{try{
  const bill=await prisma.purchaseBill.findUnique({where:{id:String(req.body.billId||'')},include:{supplier:true,lines:{include:{item:true}},returns:{include:{lines:true}}}});if(!bill||bill.status==='CANCELLED')throw new Error('Active original purchase bill is required.');
  const reason=String(req.body.reason||'').trim();if(!reason)throw new Error('Return reason is required.');const src=Array.isArray(req.body.lines)?req.body.lines:[];if(!src.length)throw new Error('Select at least one item to return.');
  const lines=[];let debitAmount=0;const movementNos=[];
  for(const x of src){const line=bill.lines.find(l=>l.id===x.billLineId);if(!line)throw new Error('One return line does not belong to the selected purchase bill.');const returned=bill.returns.flatMap(z=>z.lines).filter(z=>z.billLineId===line.id).reduce((a,z)=>a+n(z.quantity),0),qty=r4(x.quantity),available=r4(n(line.quantity)-returned);if(qty<=0||qty>available)throw new Error(`${line.item.name}: return quantity must be above zero and cannot exceed ${available} ${line.purchaseUnit}.`);const baseQty=r4(qty*n(line.converter));const live=await prisma.inventoryItem.findUnique({where:{id:line.itemId}});if(!line.locationId)throw new Error(`${line.item.name}: original bill has no receiving location.`);const lb=await prisma.inventoryLocationBalance.findUnique({where:{locationId_itemId:{locationId:line.locationId,itemId:line.itemId}}});if(n(lb?.quantity)<baseQty)throw new Error(`${line.item.name}: insufficient stock at the original receiving location.`);if(n(live.currentStock)<baseQty)throw new Error(`${line.item.name}: insufficient stock on hand to return ${baseQty} ${live.baseUnit}.`);const debit=r2((n(line.grossAmount)/n(line.quantity))*qty);debitAmount=r2(debitAmount+debit);lines.push({billLineId:line.id,itemId:line.itemId,locationId:line.locationId,quantity:qty,unit:line.purchaseUnit,converter:n(line.converter),baseQuantity:baseQty,debitAmount:debit,itemName:line.item.name});movementNos.push(await nextSequenceNo('STOCK','STK',7));}
  const outstandingBefore=n(bill.outstanding),appliedToPayable=Math.min(outstandingBefore,debitAmount),refundDue=r2(debitAmount-appliedToPayable),returnNo=await nextSequenceNo('PURCHASE_RETURN','PRN',6),returnDate=req.body.returnDate?new Date(req.body.returnDate):new Date();await assertPeriodOpen(returnDate);
  const result=await prisma.$transaction(async tx=>{const ret=await tx.purchaseReturn.create({data:{returnNo,returnDate,billId:bill.id,supplierId:bill.supplierId,reason,debitAmount,appliedToPayable,refundDue,createdById:req.user.id}});for(let i=0;i<lines.length;i++){const l=lines[i];const item=await tx.inventoryItem.findUnique({where:{id:l.itemId}});if(n(item.currentStock)<l.baseQuantity)throw new Error(`${l.itemName}: stock changed before the return could be posted.`);await tx.purchaseReturnLine.create({data:{purchaseReturnId:ret.id,billLineId:l.billLineId,itemId:l.itemId,quantity:l.quantity,unit:l.unit,converter:l.converter,baseQuantity:l.baseQuantity,debitAmount:l.debitAmount}});await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{decrement:l.baseQuantity}}});await tx.inventoryLocationBalance.update({where:{locationId_itemId:{locationId:l.locationId,itemId:l.itemId}},data:{quantity:{decrement:l.baseQuantity}}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:returnDate,itemId:l.itemId,locationId:l.locationId,type:'RETURN_OUT',quantity:l.quantity,unit:l.unit,converter:l.converter,baseQuantity:l.baseQuantity,referenceType:'PURCHASE_RETURN',referenceId:ret.id,referenceNo:returnNo,remarks:`Supplier return against ${bill.billNo}: ${reason}`,createdById:req.user.id}})}const position=await refreshBill(tx,bill.id);return {...ret,position}});
  await audit(req.user.id,'CREATE_PURCHASE_RETURN','PURCHASE_RETURN',result.id,{returnNo,billNo:bill.billNo,debitAmount,refundDue},req.ip);res.json(result);
}catch(e){res.status(400).json({message:e.message})}});

r.post('/purchases/:id/refunds',permit('SUPPLIER_REFUND_CREATE'),async(req,res)=>{try{
  const ret=await prisma.purchaseReturn.findUnique({where:{id:req.params.id},include:{supplier:true}});if(!ret)throw new Error('Purchase return not found.');const available=r2(n(ret.refundDue)-n(ret.refundedAmount)),amount=r2(req.body.amount);if(amount<=0||amount>available)throw new Error(`Refund amount must be above zero and cannot exceed ${available.toLocaleString()}.`);const bank=await prisma.companyBank.findUnique({where:{id:String(req.body.bankId||'')}});if(!bank||!bank.active)throw new Error('Select an active company bank account.');const refundDate=req.body.refundDate?new Date(req.body.refundDate):new Date();await assertPeriodOpen(refundDate);const refundNo=await nextSequenceNo('SUPPLIER_REFUND','SRF',6),txnNo=await nextSequenceNo('BANK_TXN','BTX',7);
  const row=await prisma.$transaction(async tx=>{const z=await tx.supplierRefund.create({data:{refundNo,refundDate,purchaseReturnId:ret.id,supplierId:ret.supplierId,bankId:bank.id,amount,reference:String(req.body.reference||'').trim()||null,remarks:String(req.body.remarks||'').trim()||null,createdById:req.user.id}});await tx.purchaseReturn.update({where:{id:ret.id},data:{refundedAmount:{increment:amount}}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{increment:amount}}});await tx.bankTransaction.create({data:{transactionNo:txnNo,transactionDate:refundDate,bankId:bank.id,type:'DEPOSIT',amount,referenceType:'SUPPLIER_REFUND',referenceId:z.id,referenceNo:refundNo,narration:`Supplier refund ${ret.returnNo} - ${ret.supplier.name}`,createdById:req.user.id}});return z});await audit(req.user.id,'SUPPLIER_REFUND','PURCHASE_RETURN',ret.id,{refundNo,amount,bankId:bank.id},req.ip);res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

export default r;
