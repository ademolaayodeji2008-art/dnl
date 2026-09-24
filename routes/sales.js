import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo, setting } from '../src/utils.js';
import { assertPeriodOpen, maybeFlagBackdated } from '../src/accounting.js';

const r=Router();
r.use(auth);
const n=v=>Number(v||0);
const round2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

async function buildInvoiceData(body,extraAvailable={}){
  const customer=await prisma.customer.findUnique({where:{id:body.customerId}});
  if(!customer||!customer.active)throw new Error('Active customer is required.');
  const src=Array.isArray(body.lines)?body.lines:[];if(!src.length)throw new Error('At least one invoice item is required.');
  const lines=[];let subtotal=0,vatAmount=0;
  for(let i=0;i<src.length;i++){
    const l=src[i],item=await prisma.inventoryItem.findUnique({where:{id:l.itemId},include:{conversions:{where:{active:true}}}});
    if(!item||!item.active)throw new Error('One or more invoice items are invalid or inactive.');
    const saleUnit=String(l.saleUnit||item.baseUnit).trim().toUpperCase();
    let converter=1;
    if(saleUnit!==String(item.baseUnit).toUpperCase()){
      const c=item.conversions.find(x=>String(x.transactionUnit).toUpperCase()===saleUnit);
      if(!c)throw new Error(`No active ${saleUnit} conversion exists for ${item.name}.`);
      converter=n(c.converter);
    }
    const quantity=n(l.quantity),unitPrice=l.unitPrice!==undefined?n(l.unitPrice):n(item.sellingPrice);
    if(quantity<=0||unitPrice<0)throw new Error(`Invalid quantity or price for ${item.name}.`);
    const stockQuantity=quantity*converter;
    const locationId=String(l.locationId||'');if(!locationId)throw new Error(`Select a pickup/stock location for ${item.name}.`);
    const loc=await prisma.inventoryLocation.findUnique({where:{id:locationId}});if(!loc||!loc.active)throw new Error(`Select an active pickup location for ${item.name}.`);
    const bal=await prisma.inventoryLocationBalance.findUnique({where:{locationId_itemId:{locationId,itemId:item.id}}});
    if(n(bal?.quantity)<stockQuantity)throw new Error(`Insufficient ${item.name} at ${loc.name}. Available ${n(bal?.quantity)} ${item.baseUnit}.`);
    if(n(item.currentStock)+n(extraAvailable[item.id])<stockQuantity)throw new Error(`Insufficient company stock for ${item.name}.`);
    const amount=round2(quantity*unitPrice),lineVat=round2(l.vatAmount||0),grossAmount=round2(amount+lineVat);
    subtotal+=amount;vatAmount+=lineVat;
    lines.push({lineNo:i+1,itemId:item.id,itemName:item.name,locationId,locationName:loc.name,saleUnit,quantity,converter,stockQuantity,unitPrice,amount,vatAmount:lineVat,grossAmount});
  }
  const discountAmount=Math.max(0,round2(body.discountAmount||0));
  const totalAmount=Math.max(0,round2(subtotal-discountAmount+vatAmount));
  return {customer,lines,subtotal:round2(subtotal),vatAmount:round2(vatAmount),discountAmount,totalAmount};
}


async function checkCustomerCredit(customer,totalAmount,excludeInvoiceId=null,canOverride=false){
  if(customer.creditHold&&!canOverride)throw new Error('This customer is on credit hold. An authorized credit override is required before invoicing.');
  const where={customerId:customer.id,status:{not:'CANCELLED'},outstanding:{gt:0}};if(excludeInvoiceId)where.id={not:excludeInvoiceId};
  const a=await prisma.salesInvoice.aggregate({where,_sum:{outstanding:true}}),exposure=round2(n(customer.openingBalance)+n(a._sum.outstanding)),limit=n(customer.creditLimit);
  if(limit>0&&exposure+n(totalAmount)>limit+0.01&&!canOverride)throw new Error(`Customer credit limit exceeded. Current exposure is ₦${exposure.toLocaleString()} and this invoice would increase it to ₦${round2(exposure+n(totalAmount)).toLocaleString()} against a limit of ₦${limit.toLocaleString()}.`);
  return {exposure,limit};
}
function defaultDueDate(invoiceDate,customer,explicit){if(explicit)return new Date(explicit);const days=Math.max(0,Number(customer.creditDays||0));return days?new Date(new Date(invoiceDate).getTime()+days*86400000):null;}

async function setInvoicePaidPosition(tx,invoiceId){
  const inv=await tx.salesInvoice.findUnique({where:{id:invoiceId}});if(!inv)return;
  const [a,cr]=await Promise.all([tx.salesPayment.aggregate({where:{invoiceId},_sum:{amount:true}}),tx.salesReturn.aggregate({where:{invoiceId},_sum:{creditAmount:true}})]);
  const paid=round2(a._sum.amount||0),credit=round2(cr._sum.creditAmount||0),netAmount=Math.max(0,round2(n(inv.totalAmount)-credit)),outstanding=Math.max(0,round2(netAmount-paid));
  let status='ISSUED';if(outstanding<=0)status='PAID';else if(paid>0||credit>0)status='PARTIALLY_PAID';
  await tx.salesInvoice.update({where:{id:invoiceId},data:{amountPaid:paid,outstanding,status}});
  return {paid,credit,netAmount,outstanding,status};
}

r.get('/active-banks',permit('INVOICE_VIEW'),async(req,res)=>{
  const banks=await prisma.companyBank.findMany({
    where:{active:true},
    select:{
      id:true,
      bankName:true,
      accountName:true,
      accountNumber:true
    },
    orderBy:{bankName:'asc'}
  });
  res.json(banks);
});

r.get('/options',permit('INVOICE_VIEW'),async(req,res)=>{
  const [customers,items,locations]=await Promise.all([
    prisma.customer.findMany({where:{active:true},orderBy:{name:'asc'}}),
    prisma.inventoryItem.findMany({where:{active:true},include:{conversions:{where:{active:true}},locationBalances:{where:{location:{active:true}},include:{location:true}}},orderBy:{name:'asc'}}),
    prisma.inventoryLocation.findMany({where:{active:true},orderBy:{name:'asc'}})
  ]);
  res.json({locations,customers:customers.map(c=>({id:c.id,customerCode:c.customerCode,name:c.name,creditLimit:n(c.creditLimit),creditDays:Number(c.creditDays||0),creditHold:!!c.creditHold,openingBalance:n(c.openingBalance)})),items:items.map(i=>({id:i.id,itemCode:i.itemCode,name:i.name,baseUnit:i.baseUnit,sellingPrice:n(i.sellingPrice),currentStock:n(i.currentStock),locations:i.locationBalances.map(b=>({locationId:b.locationId,name:b.location.name,address:b.location.address,quantity:n(b.quantity)})),conversions:i.conversions.map(c=>({transactionUnit:c.transactionUnit,converter:n(c.converter)}))}))});
});

r.get('/invoices',permit('INVOICE_VIEW'),async(req,res)=>{
  const where={};if(req.query.customerId)where.customerId=req.query.customerId;if(req.query.status)where.status=req.query.status;
  const rows=await prisma.salesInvoice.findMany({where,include:{customer:{select:{customerCode:true,name:true}},lines:true,_count:{select:{payments:true,receipts:true,cheques:true,returns:true}}},orderBy:{invoiceDate:'desc'},take:1000});
  const today=new Date();today.setHours(0,0,0,0);
  res.json(rows.map(x=>{const due=x.dueDate?new Date(x.dueDate):null;const displayStatus=x.status==='ISSUED'&&n(x.outstanding)>0&&due&&due<today?'OVERDUE':x.status;const editable=x.status!=='CANCELLED'&&n(x.amountPaid)===0&&x._count.payments===0&&x._count.receipts===0&&x._count.cheques===0&&x._count.returns===0;return {...x,editable,subtotal:n(x.subtotal),discountAmount:n(x.discountAmount),vatAmount:n(x.vatAmount),totalAmount:n(x.totalAmount),amountPaid:n(x.amountPaid),outstanding:n(x.outstanding),displayStatus,lines:x.lines.map(l=>({...l,quantity:n(l.quantity),converter:n(l.converter),stockQuantity:n(l.stockQuantity),unitPrice:n(l.unitPrice),amount:n(l.amount),vatAmount:n(l.vatAmount),grossAmount:n(l.grossAmount)}))};}));
});

r.get('/invoices/:id',permit('INVOICE_VIEW'),async(req,res)=>{
  const x=await prisma.salesInvoice.findUnique({where:{id:req.params.id},include:{customer:true,lines:{include:{item:true,location:true}},payments:true,receipts:true,cheques:true,returns:{include:{lines:{include:{item:true}},refunds:true}}}});if(!x)return res.status(404).json({message:'Invoice not found.'});
  res.json({...x,subtotal:n(x.subtotal),discountAmount:n(x.discountAmount),vatAmount:n(x.vatAmount),totalAmount:n(x.totalAmount),amountPaid:n(x.amountPaid),outstanding:n(x.outstanding)});
});

r.post('/invoices',permit('INVOICE_CREATE'),async(req,res)=>{
  try{
    const d=await buildInvoiceData(req.body),invoiceDate=req.body.invoiceDate?new Date(req.body.invoiceDate):new Date();await assertPeriodOpen(invoiceDate);await checkCustomerCredit(d.customer,d.totalAmount,null,req.permissions.includes('CREDIT_OVERRIDE')||req.roles.includes('SUPER_ADMIN'));
    const dueDate=defaultDueDate(invoiceDate,d.customer,req.body.dueDate),invoiceNo=await nextSequenceNo('INVOICE','INV',6),movementNos=[];
    for(const _ of d.lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
    const invoice=await prisma.$transaction(async tx=>{
      const inv=await tx.salesInvoice.create({data:{invoiceNo,customerId:d.customer.id,invoiceDate,dueDate,termsDays:Number(req.body.termsDays||d.customer.creditDays||0),status:'ISSUED',subtotal:d.subtotal,discountAmount:d.discountAmount,vatAmount:d.vatAmount,totalAmount:d.totalAmount,amountPaid:0,outstanding:d.totalAmount,notes:String(req.body.notes||'').trim()||null,salespersonId:req.body.salespersonId||req.user.id,createdById:req.user.id}});
      for(let i=0;i<d.lines.length;i++){
        const l=d.lines[i],item=await tx.inventoryItem.findUnique({where:{id:l.itemId}});if(n(item.currentStock)<l.stockQuantity)throw new Error(`Insufficient stock for ${l.itemName}.`);
        await tx.salesInvoiceLine.create({data:{invoiceId:inv.id,lineNo:l.lineNo,itemId:l.itemId,locationId:l.locationId,saleUnit:l.saleUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitPrice:l.unitPrice,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});
        await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{decrement:l.stockQuantity}}});await tx.inventoryLocationBalance.update({where:{locationId_itemId:{locationId:l.locationId,itemId:l.itemId}},data:{quantity:{decrement:l.stockQuantity}}});
        await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:inv.invoiceDate,itemId:l.itemId,locationId:l.locationId,type:'SALE',quantity:l.quantity,unit:l.saleUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'SALES_INVOICE',referenceId:inv.id,referenceNo:invoiceNo,remarks:`Sale to ${d.customer.name}`,createdById:req.user.id}});
      }
      return inv;
    });
    await audit(req.user.id,'CREATE_SALES_INVOICE','SALES_INVOICE',invoice.id,{invoiceNo,customer:d.customer.name,totalAmount:d.totalAmount},req.ip);await maybeFlagBackdated({entity:'SALES_INVOICE',entityId:invoice.id,transactionDate:invoice.invoiceDate,label:`sales invoice ${invoiceNo}`});res.json(invoice);
  }catch(e){res.status(400).json({message:e.message});}
});



async function editableInvoiceOrThrow(id){
  const inv=await prisma.salesInvoice.findUnique({where:{id},include:{lines:true,payments:true,receipts:true,cheques:true,returns:true}});
  if(!inv)throw new Error('Invoice not found.');
  if(inv.status==='CANCELLED')throw new Error('Cancelled invoices cannot be edited or deleted.');
  if(n(inv.amountPaid)!==0||inv.payments.length||inv.receipts.length||inv.cheques.length||inv.returns.length)throw new Error('This invoice is locked because settlement or return activity already exists. Only untouched unpaid invoices can be edited or deleted.');
  return inv;
}

r.put('/invoices/:id',permit('INVOICE_EDIT'),async(req,res)=>{try{
  const current=await editableInvoiceOrThrow(req.params.id),extra={};for(const l of current.lines)extra[l.itemId]=(extra[l.itemId]||0)+n(l.stockQuantity);
  const d=await buildInvoiceData(req.body,extra),newDate=req.body.invoiceDate?new Date(req.body.invoiceDate):current.invoiceDate;await assertPeriodOpen(current.invoiceDate);await assertPeriodOpen(newDate);await checkCustomerCredit(d.customer,d.totalAmount,current.id,req.permissions.includes('CREDIT_OVERRIDE')||req.roles.includes('SUPER_ADMIN'));const newDueDate=defaultDueDate(newDate,d.customer,req.body.dueDate);const movementNos=[];for(const _ of d.lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
  const updated=await prisma.$transaction(async tx=>{
    for(const l of current.lines)await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{increment:n(l.stockQuantity)}}});
    await tx.stockMovement.deleteMany({where:{referenceType:'SALES_INVOICE',referenceId:current.id}});await tx.salesInvoiceLine.deleteMany({where:{invoiceId:current.id}});
    const inv=await tx.salesInvoice.update({where:{id:current.id},data:{customerId:d.customer.id,invoiceDate:newDate,dueDate:newDueDate,termsDays:Number(req.body.termsDays||d.customer.creditDays||0),subtotal:d.subtotal,discountAmount:d.discountAmount,vatAmount:d.vatAmount,totalAmount:d.totalAmount,amountPaid:0,outstanding:d.totalAmount,status:'ISSUED',notes:String(req.body.notes||'').trim()||null}});
    for(let i=0;i<d.lines.length;i++){const l=d.lines[i],item=await tx.inventoryItem.findUnique({where:{id:l.itemId}});if(n(item.currentStock)<l.stockQuantity)throw new Error(`Insufficient stock for ${l.itemName}.`);await tx.salesInvoiceLine.create({data:{invoiceId:inv.id,lineNo:l.lineNo,itemId:l.itemId,locationId:l.locationId,saleUnit:l.saleUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitPrice:l.unitPrice,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{decrement:l.stockQuantity}}});await tx.inventoryLocationBalance.update({where:{locationId_itemId:{locationId:l.locationId,itemId:l.itemId}},data:{quantity:{decrement:l.stockQuantity}}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:inv.invoiceDate,itemId:l.itemId,locationId:l.locationId,type:'SALE',quantity:l.quantity,unit:l.saleUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'SALES_INVOICE',referenceId:inv.id,referenceNo:inv.invoiceNo,remarks:`Edited sale to ${d.customer.name}`,createdById:req.user.id}})}return inv;
  });
  await audit(req.user.id,'UPDATE_SALES_INVOICE','SALES_INVOICE',updated.id,{invoiceNo:updated.invoiceNo,totalAmount:d.totalAmount},req.ip);res.json(updated);
}catch(e){res.status(400).json({message:e.message})}});

r.delete('/invoices/:id',permit('INVOICE_DELETE'),async(req,res)=>{try{
  const inv=await editableInvoiceOrThrow(req.params.id);await assertPeriodOpen(inv.invoiceDate);
  await prisma.$transaction(async tx=>{for(const l of inv.lines)await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{increment:n(l.stockQuantity)}}});await tx.stockMovement.deleteMany({where:{referenceType:'SALES_INVOICE',referenceId:inv.id}});await tx.salesInvoice.delete({where:{id:inv.id}})});
  await audit(req.user.id,'DELETE_SALES_INVOICE','SALES_INVOICE',inv.id,{invoiceNo:inv.invoiceNo,totalAmount:n(inv.totalAmount)},req.ip);res.json({message:'Invoice deleted and stock restored.'});
}catch(e){res.status(400).json({message:e.message})}});

r.post('/invoices-with-settlement',permit('INVOICE_CREATE'),async(req,res)=>{
  try{
    const d=await buildInvoiceData(req.body),invoiceDate=req.body.invoiceDate?new Date(req.body.invoiceDate):new Date();await assertPeriodOpen(invoiceDate);await checkCustomerCredit(d.customer,d.totalAmount,null,req.permissions.includes('CREDIT_OVERRIDE')||req.roles.includes('SUPER_ADMIN'));
    const payments=(Array.isArray(req.body.payments)?req.body.payments:[]).filter(x=>round2(x.amount)>0);
    const cheques=(Array.isArray(req.body.cheques)?req.body.cheques:[]).filter(x=>round2(x.amount)>0);
    const immediateTotal=round2(payments.reduce((sum,x)=>sum+round2(x.amount),0));
    const chequeTotal=round2(cheques.reduce((sum,x)=>sum+round2(x.amount),0));
    if(immediateTotal+chequeTotal>d.totalAmount+0.01)throw new Error('Settlement exceeds the invoice total.');

    for(const p of payments){
      const method=String(p.method||'').toUpperCase();
      if(!['CASH','TRANSFER','POS','OTHER'].includes(method))throw new Error(`Invalid payment method: ${method||'blank'}.`);
      if(['TRANSFER','POS'].includes(method)){
        const bank=await prisma.companyBank.findUnique({where:{id:String(p.bankId||'')}});
        if(!bank||!bank.active)throw new Error('Select an active Dariltweens bank account for every Transfer/POS payment.');
      }
    }
    for(const c of cheques){
      if(!String(c.chequeNo||'').trim()||!String(c.drawerBank||'').trim())throw new Error('Cheque number and drawer bank are required for every PDC.');
      if(!c.chequeDate||!c.expectedPresentationDate)throw new Error('Cheque date and expected presentation date are required for every PDC.');
    }

    const invoiceNo=await nextSequenceNo('INVOICE','INV',6);
    const movementNos=[];for(const _ of d.lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
    const paymentNos=[],receiptNos=[],bankTxnNos=[];
    for(const p of payments){paymentNos.push(await nextSequenceNo('SALES_PAYMENT','PAY',6));receiptNos.push(await nextSequenceNo('RECEIPT','RCT',6));bankTxnNos.push(['TRANSFER','POS'].includes(String(p.method||'').toUpperCase())?await nextSequenceNo('BANK_TXN','BTX',7):null);}
    const chequeCodes=[];for(const _ of cheques)chequeCodes.push((await nextSequenceNo('CHEQUE','CHQ',6)).replaceAll('/','-'));

    const result=await prisma.$transaction(async tx=>{
      const inv=await tx.salesInvoice.create({data:{invoiceNo,customerId:d.customer.id,invoiceDate,dueDate:defaultDueDate(invoiceDate,d.customer,req.body.dueDate),termsDays:Number(req.body.termsDays||d.customer.creditDays||0),status:'ISSUED',subtotal:d.subtotal,discountAmount:d.discountAmount,vatAmount:d.vatAmount,totalAmount:d.totalAmount,amountPaid:0,outstanding:d.totalAmount,notes:String(req.body.notes||'').trim()||null,salespersonId:req.body.salespersonId||req.user.id,createdById:req.user.id}});
      for(let i=0;i<d.lines.length;i++){
        const l=d.lines[i],item=await tx.inventoryItem.findUnique({where:{id:l.itemId}});if(n(item.currentStock)<l.stockQuantity)throw new Error(`Insufficient stock for ${l.itemName}.`);
        await tx.salesInvoiceLine.create({data:{invoiceId:inv.id,lineNo:l.lineNo,itemId:l.itemId,locationId:l.locationId,saleUnit:l.saleUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitPrice:l.unitPrice,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});
        await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{decrement:l.stockQuantity}}});await tx.inventoryLocationBalance.update({where:{locationId_itemId:{locationId:l.locationId,itemId:l.itemId}},data:{quantity:{decrement:l.stockQuantity}}});
        await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:inv.invoiceDate,itemId:l.itemId,locationId:l.locationId,type:'SALE',quantity:l.quantity,unit:l.saleUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'SALES_INVOICE',referenceId:inv.id,referenceNo:invoiceNo,remarks:`Sale to ${d.customer.name}`,createdById:req.user.id}});
      }
      const createdPayments=[];
      for(let i=0;i<payments.length;i++){
        const p=payments[i],method=String(p.method||'').toUpperCase(),amount=round2(p.amount),paymentDate=p.paymentDate?new Date(p.paymentDate):inv.invoiceDate;
        let bank=null;if(['TRANSFER','POS'].includes(method))bank=await tx.companyBank.findUnique({where:{id:String(p.bankId)}});
        const pay=await tx.salesPayment.create({data:{paymentNo:paymentNos[i],paymentDate,customerId:inv.customerId,invoiceId:inv.id,amount,method,bankId:bank?.id||null,bankAccount:bank?`${bank.bankName} | ${bank.accountNumber}`:(String(p.bankAccount||'').trim()||null),reference:String(p.reference||'').trim()||null,remarks:String(p.remarks||'').trim()||null,receivedById:req.user.id}});
        const receipt=await tx.salesReceipt.create({data:{receiptNo:receiptNos[i],receiptDate:paymentDate,customerId:inv.customerId,invoiceId:inv.id,paymentId:pay.id,amount,paymentMethod:method,reference:pay.reference,remarks:pay.remarks,issuedById:req.user.id}});
        if(bank){await tx.bankTransaction.create({data:{transactionNo:bankTxnNos[i],transactionDate:paymentDate,bankId:bank.id,type:'DEPOSIT',amount,referenceType:'SALES_PAYMENT',referenceId:pay.id,referenceNo:paymentNos[i],narration:`${method} receipt for ${invoiceNo}`,createdById:req.user.id}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{increment:amount}}});}
        createdPayments.push({payment:pay,receipt});
      }
      const createdCheques=[];
      for(let i=0;i<cheques.length;i++){
        const c=cheques[i],chq=await tx.customerCheque.create({data:{chequeCode:chequeCodes[i],invoiceId:inv.id,customerId:inv.customerId,chequeNo:String(c.chequeNo).trim(),drawerBank:String(c.drawerBank).trim(),amount:round2(c.amount),dateReceived:c.dateReceived?new Date(c.dateReceived):inv.invoiceDate,chequeDate:new Date(c.chequeDate),expectedPresentationDate:new Date(c.expectedPresentationDate),remarks:String(c.remarks||'').trim()||null,createdById:req.user.id}});createdCheques.push(chq);
      }
      const position=await setInvoicePaidPosition(tx,inv.id);
      return {invoice:{...inv,...position},payments:createdPayments,cheques:createdCheques};
    });
    await audit(req.user.id,'CREATE_INVOICE_WITH_SETTLEMENT','SALES_INVOICE',result.invoice.id,{invoiceNo,totalAmount:d.totalAmount,immediateTotal,chequeTotal},req.ip);
    res.json(result);
  }catch(e){res.status(400).json({message:e.message});}
});

r.post('/invoices/:id/payments',permit('SALES_PAYMENT_CREATE'),async(req,res)=>{
  try{
    const inv=await prisma.salesInvoice.findUnique({where:{id:req.params.id}});if(!inv||inv.status==='CANCELLED')return res.status(404).json({message:'Active invoice not found.'});const paymentDate=req.body.paymentDate?new Date(req.body.paymentDate):new Date();await assertPeriodOpen(paymentDate);
    const method=String(req.body.method||'').toUpperCase();if(!['CASH','TRANSFER','POS','OTHER'].includes(method))return res.status(400).json({message:'Use Cheque Tracking for cheque payments.'});
    const amount=round2(req.body.amount);if(amount<=0||amount>n(inv.outstanding))return res.status(400).json({message:'Payment amount must be greater than zero and not exceed outstanding.'});
    let bank=null;
    const bankRequired=['TRANSFER','POS'].includes(method);
    if(bankRequired){bank=await prisma.companyBank.findUnique({where:{id:String(req.body.bankId||'')}});if(!bank||!bank.active)return res.status(400).json({message:'Select the Dariltweens bank account that received this payment.'});}
    const paymentNo=await nextSequenceNo('SALES_PAYMENT','PAY',6),receiptNo=await nextSequenceNo('RECEIPT','RCT',6),bankTxnNo=bank?await nextSequenceNo('BANK_TXN','BTX',7):null;
    const result=await prisma.$transaction(async tx=>{
      const paymentDate=req.body.paymentDate?new Date(req.body.paymentDate):new Date();
      const p=await tx.salesPayment.create({data:{paymentNo,paymentDate,customerId:inv.customerId,invoiceId:inv.id,amount,method,bankId:bank?.id||null,bankAccount:bank?`${bank.bankName} | ${bank.accountNumber}`:(String(req.body.bankAccount||'').trim()||null),reference:String(req.body.reference||'').trim()||null,remarks:String(req.body.remarks||'').trim()||null,receivedById:req.user.id}});
      const receipt=await tx.salesReceipt.create({data:{receiptNo,receiptDate:p.paymentDate,customerId:inv.customerId,invoiceId:inv.id,paymentId:p.id,amount,paymentMethod:method,reference:p.reference,remarks:p.remarks,issuedById:req.user.id}});
      if(bank){await tx.bankTransaction.create({data:{transactionNo:bankTxnNo,transactionDate:paymentDate,bankId:bank.id,type:'DEPOSIT',amount,referenceType:'SALES_PAYMENT',referenceId:p.id,referenceNo:paymentNo,narration:`${method} receipt for ${inv.invoiceNo}`,createdById:req.user.id}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{increment:amount}}});}
      const position=await setInvoicePaidPosition(tx,inv.id);return {payment:p,receipt,position};
    });
    await audit(req.user.id,'RECEIVE_SALES_PAYMENT','SALES_INVOICE',inv.id,{paymentNo,receiptNo,amount,method},req.ip);res.json(result);
  }catch(e){res.status(400).json({message:e.message});}
});

r.post('/cash-sales',permit('INVOICE_CREATE'),async(req,res)=>{
  try{
    const d=await buildInvoiceData(req.body),invoiceNo=await nextSequenceNo('INVOICE','INV',6),paymentNo=await nextSequenceNo('SALES_PAYMENT','PAY',6),receiptNo=await nextSequenceNo('RECEIPT','RCT',6),movementNos=[];
    for(const _ of d.lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
    const method=String(req.body.paymentMethod||'CASH').toUpperCase();if(!['CASH','TRANSFER','POS','OTHER'].includes(method))throw new Error('Invalid cash-sale payment method.');
    let bank=null,bankTxnNo=null;if(['TRANSFER','POS'].includes(method)){bank=await prisma.companyBank.findUnique({where:{id:String(req.body.bankId||'')}});if(!bank||!bank.active)throw new Error('Select the Dariltweens bank account that received this sale.');bankTxnNo=await nextSequenceNo('BANK_TXN','BTX',7);}
    const result=await prisma.$transaction(async tx=>{
      const inv=await tx.salesInvoice.create({data:{invoiceNo,customerId:d.customer.id,invoiceDate:req.body.invoiceDate?new Date(req.body.invoiceDate):new Date(),dueDate:req.body.invoiceDate?new Date(req.body.invoiceDate):new Date(),termsDays:0,status:'PAID',subtotal:d.subtotal,discountAmount:d.discountAmount,vatAmount:d.vatAmount,totalAmount:d.totalAmount,amountPaid:d.totalAmount,outstanding:0,notes:String(req.body.notes||'').trim()||null,salespersonId:req.user.id,createdById:req.user.id}});
      for(let i=0;i<d.lines.length;i++){const l=d.lines[i],item=await tx.inventoryItem.findUnique({where:{id:l.itemId}});if(n(item.currentStock)<l.stockQuantity)throw new Error(`Insufficient stock for ${l.itemName}.`);await tx.salesInvoiceLine.create({data:{invoiceId:inv.id,lineNo:l.lineNo,itemId:l.itemId,locationId:l.locationId,saleUnit:l.saleUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitPrice:l.unitPrice,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{decrement:l.stockQuantity}}});await tx.inventoryLocationBalance.update({where:{locationId_itemId:{locationId:l.locationId,itemId:l.itemId}},data:{quantity:{decrement:l.stockQuantity}}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:inv.invoiceDate,itemId:l.itemId,locationId:l.locationId,type:'SALE',quantity:l.quantity,unit:l.saleUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'CASH_SALE',referenceId:inv.id,referenceNo:invoiceNo,remarks:`Cash sale to ${d.customer.name}`,createdById:req.user.id}});}
      const p=await tx.salesPayment.create({data:{paymentNo,paymentDate:inv.invoiceDate,customerId:inv.customerId,invoiceId:inv.id,amount:d.totalAmount,method,bankId:bank?.id||null,bankAccount:bank?`${bank.bankName} | ${bank.accountNumber}`:(String(req.body.bankAccount||'').trim()||null),reference:String(req.body.reference||'').trim()||null,remarks:'Cash sale settlement',receivedById:req.user.id}});
      const receipt=await tx.salesReceipt.create({data:{receiptNo,receiptDate:inv.invoiceDate,customerId:inv.customerId,invoiceId:inv.id,paymentId:p.id,amount:d.totalAmount,paymentMethod:method,reference:p.reference,remarks:'Cash sale receipt',issuedById:req.user.id}});if(bank){await tx.bankTransaction.create({data:{transactionNo:bankTxnNo,transactionDate:inv.invoiceDate,bankId:bank.id,type:'DEPOSIT',amount:d.totalAmount,referenceType:'CASH_SALE',referenceId:p.id,referenceNo:paymentNo,narration:`${method} cash sale ${invoiceNo}`,createdById:req.user.id}});await tx.companyBank.update({where:{id:bank.id},data:{currentBalance:{increment:d.totalAmount}}});}return {invoice:inv,payment:p,receipt};
    });
    await audit(req.user.id,'CREATE_CASH_SALE','SALES_INVOICE',result.invoice.id,{invoiceNo,receiptNo,totalAmount:d.totalAmount},req.ip);res.json(result);
  }catch(e){res.status(400).json({message:e.message});}
});

r.post('/invoices/:id/cancel',permit('INVOICE_CANCEL'),async(req,res)=>{
  try{
    const inv=await prisma.salesInvoice.findUnique({where:{id:req.params.id},include:{lines:true,payments:true,cheques:true,returns:true}});if(!inv)return res.status(404).json({message:'Invoice not found.'});
    if(inv.status==='CANCELLED')return res.status(409).json({message:'Invoice is already cancelled.'});
    if(inv.payments.length) return res.status(409).json({message:'Invoice with recorded payments cannot be cancelled. Reverse/refund the payments first.'});
    if(inv.returns.length) return res.status(409).json({message:'Invoice with credit notes/returns cannot be cancelled. Preserve the original invoice and return history.'});
    if(inv.cheques.some(c=>['HELD','PRESENTED','CLEARED'].includes(c.status)))return res.status(409).json({message:'Resolve active cheques before cancelling this invoice.'});
    const reason=String(req.body.reason||'').trim();if(!reason)return res.status(400).json({message:'Cancellation reason is required.'});
    const movementNos=[];for(const _ of inv.lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
    await prisma.$transaction(async tx=>{for(let i=0;i<inv.lines.length;i++){const l=inv.lines[i];await tx.inventoryItem.update({where:{id:l.itemId},data:{currentStock:{increment:n(l.stockQuantity)}}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:new Date(),itemId:l.itemId,type:'RETURN_IN',quantity:n(l.quantity),unit:l.saleUnit,converter:n(l.converter),baseQuantity:n(l.stockQuantity),referenceType:'INVOICE_CANCELLATION',referenceId:inv.id,referenceNo:inv.invoiceNo,remarks:reason,createdById:req.user.id}});}await tx.salesInvoice.update({where:{id:inv.id},data:{status:'CANCELLED',cancelledById:req.user.id,cancelledAt:new Date(),cancellationReason:reason}});});
    await audit(req.user.id,'CANCEL_SALES_INVOICE','SALES_INVOICE',inv.id,{invoiceNo:inv.invoiceNo,reason},req.ip);res.json({message:'Invoice cancelled and stock restored.'});
  }catch(e){res.status(400).json({message:e.message});}
});

r.get('/receipts',permit('RECEIPT_VIEW'),async(req,res)=>{
  const rows=await prisma.salesReceipt.findMany({include:{customer:{select:{name:true,customerCode:true}},invoice:{select:{invoiceNo:true}}},orderBy:{receiptDate:'desc'},take:1000});res.json(rows.map(x=>({...x,amount:n(x.amount)})));
});

export default r;
