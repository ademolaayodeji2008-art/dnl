import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
const r=Router();r.use(auth);const n=v=>Number(v||0);
const range=(from,to)=>{if(!from&&!to)return undefined;const x={};if(from)x.gte=new Date(from+'T00:00:00');if(to)x.lte=new Date(to+'T23:59:59.999');return x};
export const catalog=[
 ['bank','Bank Transaction Ledger','Banking'],['bank-summary','Bank Account Summary','Banking'],['sales','Sales Invoice Register','Sales'],['sales-returns','Sales Returns / Credit Notes','Sales'],['customer-refunds','Customer Refund Register','Sales'],['net-sales','Net Sales after Returns','Sales'],['sales-items','Sales by Item','Sales'],['sales-customers','Sales by Customer','Sales'],['collections','Customer Collections','Sales'],['receivables','Receivables / Outstanding Invoices','Sales'],['customers','Customer Balance Summary','Sales'],['inventory','Inventory Valuation','Inventory'],['stock-by-location','Stock by Location','Inventory'],['location-stock-value','Location Stock Valuation','Inventory'],['stock-transfers','Stock Transfer Register','Inventory'],['sales-location','Sales by Location','Sales'],['stock-movements','Stock Movement Ledger','Inventory'],['stock-adjustments','Stock Adjustments','Inventory'],['inventory-issues','PR / Regulatory / Write-off Issues','Inventory'],['return-stock','Return Stock Movements','Inventory'],['purchases','Purchase Bill Register','Purchases'],['purchase-returns','Purchase Returns / Debit Notes','Purchases'],['supplier-refunds','Supplier Refund Register','Purchases'],['net-purchases','Net Purchases after Returns','Purchases'],['purchase-items','Purchases by Item','Purchases'],['supplier-payments','Supplier Payments','Purchases'],['suppliers','Supplier Payables Summary','Purchases'],['cheques','Cheque Register','Controls']
];

const unrestrictedReportRoles=new Set(['SUPER_ADMIN','ADMIN','ACCOUNT_OFFICER','CEO','INTERNAL_AUDITOR']);
const roleReportGroups={SALES_PERSON:new Set(['Sales']),INVENTORY_OFFICER:new Set(['Inventory'])};
function reportCatalogFor(req){
  if((req.roles||[]).some(r=>unrestrictedReportRoles.has(r)))return catalog;
  const groups=new Set();
  for(const role of (req.roles||[])){const allowed=roleReportGroups[role];if(allowed)for(const g of allowed)groups.add(g);}
  return catalog.filter(([, ,group])=>groups.has(group));
}
function assertReportAllowed(req,type){
  const allowed=reportCatalogFor(req);
  if(!allowed.some(([code])=>code===type)){const e=new Error('You are not authorized to generate this business report.');e.status=403;throw e;}
}

async function data(type,q){const dr=range(q.from,q.to);
 if(type==='bank'){const where={};if(dr)where.transactionDate=dr;if(q.bankId)where.bankId=q.bankId;return (await prisma.bankTransaction.findMany({where,include:{bank:true},orderBy:[{transactionDate:'asc'},{createdAt:'asc'}]})).map(x=>({Date:x.transactionDate,Reference:x.transactionNo,Bank:`${x.bank.bankName} ${x.bank.accountNumber}`,Type:x.type,ReferenceNo:x.referenceNo||'',Narration:x.narration,Inflow:['OPENING','DEPOSIT','TRANSFER_IN'].includes(x.type)?n(x.amount):0,Outflow:['WITHDRAWAL','TRANSFER_OUT'].includes(x.type)?n(x.amount):0}));}
 if(type==='bank-summary')return (await prisma.companyBank.findMany({orderBy:{bankName:'asc'}})).map(x=>({BankCode:x.bankCode,Bank:x.bankName,AccountNumber:x.accountNumber,AccountName:x.accountName,OpeningBalance:n(x.openingBalance),CurrentBalance:n(x.currentBalance),Status:x.active?'ACTIVE':'INACTIVE'}));
 if(type==='sales'){const where={status:{not:'CANCELLED'}};if(dr)where.invoiceDate=dr;return (await prisma.salesInvoice.findMany({where,include:{customer:true},orderBy:{invoiceDate:'asc'}})).map(x=>({Date:x.invoiceDate,Invoice:x.invoiceNo,Customer:x.customer.name,Status:x.status,Subtotal:n(x.subtotal),Discount:n(x.discountAmount),VAT:n(x.vatAmount),Total:n(x.totalAmount),Paid:n(x.amountPaid),Outstanding:n(x.outstanding)}));}
 if(type==='sales-returns'){const where={};if(dr)where.returnDate=dr;return (await prisma.salesReturn.findMany({where,include:{customer:true,invoice:true},orderBy:{returnDate:'asc'}})).map(x=>({Date:x.returnDate,ReturnNo:x.returnNo,Invoice:x.invoice.invoiceNo,Customer:x.customer.name,CreditNote:n(x.creditAmount),AppliedToReceivable:n(x.appliedToReceivable),RefundDue:n(x.refundDue),Refunded:n(x.refundedAmount),Reason:x.reason}));}
 if(type==='customer-refunds'){const where={};if(dr)where.refundDate=dr;return (await prisma.customerRefund.findMany({where,include:{customer:true,salesReturn:true,bank:true},orderBy:{refundDate:'asc'}})).map(x=>({Date:x.refundDate,RefundNo:x.refundNo,ReturnNo:x.salesReturn.returnNo,Customer:x.customer.name,Bank:`${x.bank.bankName} ${x.bank.accountNumber}`,Reference:x.reference||'',Amount:n(x.amount),Remarks:x.remarks||''}));}
 if(type==='net-sales'){const iw={status:{not:'CANCELLED'}},rw={};if(dr){iw.invoiceDate=dr;rw.returnDate=dr;}const [i,r]=await Promise.all([prisma.salesInvoice.aggregate({where:iw,_sum:{totalAmount:true}}),prisma.salesReturn.aggregate({where:rw,_sum:{creditAmount:true}})]);const gross=n(i._sum.totalAmount),returns=n(r._sum.creditAmount);return [{GrossSales:gross,SalesReturns:returns,NetSales:gross-returns}];}
 if(type==='sales-items'){const where={invoice:{status:{not:'CANCELLED'}}};if(dr)where.invoice.invoiceDate=dr;const ls=await prisma.salesInvoiceLine.findMany({where,include:{item:true,invoice:true}}),m=new Map();for(const l of ls){const k=l.itemId,a=m.get(k)||{ItemCode:l.item.itemCode,Item:l.item.name,BaseUnit:l.item.baseUnit,QuantityBase:0,SalesValue:0,VAT:0};a.QuantityBase+=n(l.stockQuantity);a.SalesValue+=n(l.amount);a.VAT+=n(l.vatAmount);m.set(k,a)}return [...m.values()].sort((a,b)=>b.SalesValue-a.SalesValue);}
 if(type==='sales-customers'){const where={status:{not:'CANCELLED'}};if(dr)where.invoiceDate=dr;const rows=await prisma.salesInvoice.findMany({where,include:{customer:true}}),m=new Map();for(const x of rows){const a=m.get(x.customerId)||{CustomerCode:x.customer.customerCode,Customer:x.customer.name,Invoices:0,Sales:0,Paid:0,Outstanding:0};a.Invoices++;a.Sales+=n(x.totalAmount);a.Paid+=n(x.amountPaid);a.Outstanding+=n(x.outstanding);m.set(x.customerId,a)}return [...m.values()].sort((a,b)=>b.Sales-a.Sales);}
 if(type==='collections'){const where={};if(dr)where.paymentDate=dr;return (await prisma.salesPayment.findMany({where,include:{customer:true,invoice:true,bank:true},orderBy:{paymentDate:'asc'}})).map(x=>({Date:x.paymentDate,PaymentNo:x.paymentNo,Customer:x.customer.name,Invoice:x.invoice?.invoiceNo||'',Method:x.method,Bank:x.bank?`${x.bank.bankName} ${x.bank.accountNumber}`:'',Reference:x.reference||'',Amount:n(x.amount)}));}
 if(type==='receivables'){const where={outstanding:{gt:0},status:{not:'CANCELLED'}};if(dr)where.invoiceDate=dr;return (await prisma.salesInvoice.findMany({where,include:{customer:true},orderBy:{invoiceDate:'asc'}})).map(x=>({InvoiceDate:x.invoiceDate,DueDate:x.dueDate,Invoice:x.invoiceNo,Customer:x.customer.name,Total:n(x.totalAmount),Paid:n(x.amountPaid),Outstanding:n(x.outstanding),Status:x.status}));}
 if(type==='customers'){const cs=await prisma.customer.findMany({orderBy:{name:'asc'}}),out=[];for(const c of cs){const invWhere={customerId:c.id,status:{not:'CANCELLED'}};if(dr)invWhere.invoiceDate=dr;const inv=await prisma.salesInvoice.aggregate({where:invWhere,_sum:{totalAmount:true,outstanding:true}});out.push({Code:c.customerCode,Customer:c.name,Opening:n(c.openingBalance),Sales:n(inv._sum.totalAmount),Outstanding:n(c.openingBalance)+n(inv._sum.outstanding),CreditLimit:n(c.creditLimit)});}return out;}
 if(type==='stock-by-location'){const rows=await prisma.inventoryLocationBalance.findMany({include:{location:true,item:true},orderBy:[{location:{name:'asc'}},{item:{name:'asc'}}]});return rows.map(x=>({LocationCode:x.location.locationCode,Location:x.location.name,Address:x.location.address||'',ItemCode:x.item.itemCode,Item:x.item.name,BaseUnit:x.item.baseUnit,Quantity:n(x.quantity),Status:x.location.active?'ACTIVE':'INACTIVE'}));}
 if(type==='location-stock-value'){const rows=await prisma.inventoryLocationBalance.findMany({include:{location:true,item:true}}),m=new Map();for(const x of rows){const a=m.get(x.locationId)||{LocationCode:x.location.locationCode,Location:x.location.name,Items:0,QuantityBase:0,StockValue:0};if(n(x.quantity)!==0)a.Items++;a.QuantityBase+=n(x.quantity);a.StockValue+=n(x.quantity)*n(x.item.costPrice);m.set(x.locationId,a)}return [...m.values()];}
 if(type==='stock-transfers'){const where={};if(dr)where.transferDate=dr;const rows=await prisma.stockTransfer.findMany({where,include:{fromLocation:true,toLocation:true,lines:{include:{item:true}}},orderBy:{transferDate:'asc'}}),out=[];for(const x of rows)for(const l of x.lines)out.push({Date:x.transferDate,TransferNo:x.transferNo,From:x.fromLocation.name,To:x.toLocation.name,ItemCode:l.item.itemCode,Item:l.item.name,Quantity:n(l.quantity),Unit:l.unit,BaseQuantity:n(l.baseQuantity),Status:x.status,Remarks:x.remarks||''});return out;}
 if(type==='sales-location'){const where={invoice:{status:{not:'CANCELLED'}}};if(dr)where.invoice.invoiceDate=dr;const ls=await prisma.salesInvoiceLine.findMany({where,include:{location:true,item:true,invoice:true}}),m=new Map();for(const l of ls){const k=l.locationId||'UNALLOCATED',a=m.get(k)||{Location:l.location?.name||'Unallocated / Legacy',Invoices:new Set(),QuantityBase:0,SalesValue:0};a.Invoices.add(l.invoiceId);a.QuantityBase+=n(l.stockQuantity);a.SalesValue+=n(l.grossAmount);m.set(k,a)}return [...m.values()].map(a=>({Location:a.Location,Invoices:a.Invoices.size,QuantityBase:a.QuantityBase,SalesValue:a.SalesValue})).sort((a,b)=>b.SalesValue-a.SalesValue);}
 if(type==='inventory')return (await prisma.inventoryItem.findMany({orderBy:{name:'asc'}})).map(x=>({Code:x.itemCode,Item:x.name,Category:x.category||'',BaseUnit:x.baseUnit,CurrentStock:n(x.currentStock),CostPrice:n(x.costPrice),SellingPrice:n(x.sellingPrice),StockValue:n(x.currentStock)*n(x.costPrice),ReorderLevel:n(x.reorderLevel)}));
 if(type==='stock-movements'){const where={};if(dr)where.movementDate=dr;return (await prisma.stockMovement.findMany({where,include:{item:true,location:true},orderBy:{movementDate:'asc'}})).map(x=>({Date:x.movementDate,MovementNo:x.movementNo,Location:x.location?.name||'Unallocated',ItemCode:x.item.itemCode,Item:x.item.name,Type:x.type,Quantity:n(x.quantity),Unit:x.unit,Converter:n(x.converter),BaseQuantity:n(x.baseQuantity),Reference:x.referenceNo||'',Remarks:x.remarks||''}));}
 if(type==='stock-adjustments'){const where={};if(dr)where.adjustmentDate=dr;const rows=await prisma.stockAdjustment.findMany({where,include:{lines:{include:{item:true}}},orderBy:{adjustmentDate:'asc'}}),out=[];for(const x of rows)for(const l of x.lines)out.push({Date:x.adjustmentDate,AdjustmentNo:x.adjustmentNo,ItemCode:l.item.itemCode,Item:l.item.name,Direction:l.direction,Quantity:n(l.quantity),Unit:l.unit,BaseQuantity:n(l.baseQuantity),Reason:x.reason,Remarks:x.remarks||''});return out;}
 if(type==='inventory-issues'){const where={};if(dr)where.issueDate=dr;const rows=await prisma.inventoryIssue.findMany({where,include:{lines:{include:{item:true}}},orderBy:{issueDate:'asc'}}),out=[];for(const x of rows)for(const l of x.lines)out.push({Date:x.issueDate,IssueNo:x.issueNo,IssueType:x.issueType,RecipientAgency:x.recipientAgency||'',AuthorizationRef:x.authorizationRef||'',ItemCode:l.item.itemCode,Item:l.item.name,Quantity:n(l.quantity),Unit:l.unit,BaseQuantity:n(l.baseQuantity),UnitCost:n(l.unitCost),CostValue:n(l.lineCost),Reason:x.reason,Remarks:x.remarks||''});return out;}
 if(type==='return-stock'){const where={type:{in:['RETURN_IN','RETURN_OUT']}};if(dr)where.movementDate=dr;return (await prisma.stockMovement.findMany({where,include:{item:true},orderBy:{movementDate:'asc'}})).map(x=>({Date:x.movementDate,MovementNo:x.movementNo,ItemCode:x.item.itemCode,Item:x.item.name,Type:x.type,Quantity:n(x.quantity),Unit:x.unit,BaseQuantity:n(x.baseQuantity),ReferenceType:x.referenceType||'',Reference:x.referenceNo||'',Remarks:x.remarks||''}));}
 if(type==='purchases'){const where={status:{not:'CANCELLED'}};if(dr)where.billDate=dr;return (await prisma.purchaseBill.findMany({where,include:{supplier:true},orderBy:{billDate:'asc'}})).map(x=>({Date:x.billDate,Bill:x.billNo,Supplier:x.supplier.name,SupplierInvoice:x.supplierInvoiceNo||'',Status:x.status,Subtotal:n(x.subtotal),Discount:n(x.discountAmount),VAT:n(x.vatAmount),Total:n(x.totalAmount),Paid:n(x.amountPaid),Outstanding:n(x.outstanding)}));}
 if(type==='purchase-returns'){const where={};if(dr)where.returnDate=dr;return (await prisma.purchaseReturn.findMany({where,include:{supplier:true,bill:true},orderBy:{returnDate:'asc'}})).map(x=>({Date:x.returnDate,ReturnNo:x.returnNo,Bill:x.bill.billNo,Supplier:x.supplier.name,DebitNote:n(x.debitAmount),AppliedToPayable:n(x.appliedToPayable),RefundDue:n(x.refundDue),Refunded:n(x.refundedAmount),Reason:x.reason}));}
 if(type==='supplier-refunds'){const where={};if(dr)where.refundDate=dr;return (await prisma.supplierRefund.findMany({where,include:{supplier:true,purchaseReturn:true,bank:true},orderBy:{refundDate:'asc'}})).map(x=>({Date:x.refundDate,RefundNo:x.refundNo,ReturnNo:x.purchaseReturn.returnNo,Supplier:x.supplier.name,Bank:`${x.bank.bankName} ${x.bank.accountNumber}`,Reference:x.reference||'',Amount:n(x.amount),Remarks:x.remarks||''}));}
 if(type==='net-purchases'){const bw={status:{not:'CANCELLED'}},rw={};if(dr){bw.billDate=dr;rw.returnDate=dr;}const [b,r]=await Promise.all([prisma.purchaseBill.aggregate({where:bw,_sum:{totalAmount:true}}),prisma.purchaseReturn.aggregate({where:rw,_sum:{debitAmount:true}})]);const gross=n(b._sum.totalAmount),returns=n(r._sum.debitAmount);return [{GrossPurchases:gross,PurchaseReturns:returns,NetPurchases:gross-returns}];}
 if(type==='purchase-items'){const where={bill:{status:{not:'CANCELLED'}}};if(dr)where.bill.billDate=dr;const ls=await prisma.purchaseBillLine.findMany({where,include:{item:true,bill:true}}),m=new Map();for(const l of ls){const k=l.itemId,a=m.get(k)||{ItemCode:l.item.itemCode,Item:l.item.name,BaseUnit:l.item.baseUnit,QuantityBase:0,PurchaseValue:0,VAT:0};a.QuantityBase+=n(l.stockQuantity);a.PurchaseValue+=n(l.amount);a.VAT+=n(l.vatAmount);m.set(k,a)}return [...m.values()].sort((a,b)=>b.PurchaseValue-a.PurchaseValue);}
 if(type==='supplier-payments'){const where={};if(dr)where.paymentDate=dr;return (await prisma.purchasePayment.findMany({where,include:{supplier:true,bill:true,bank:true},orderBy:{paymentDate:'asc'}})).map(x=>({Date:x.paymentDate,PaymentNo:x.paymentNo,Supplier:x.supplier.name,Bill:x.bill?.billNo||'',Bank:`${x.bank.bankName} ${x.bank.accountNumber}`,Reference:x.reference||'',Amount:n(x.amount),Remarks:x.remarks||''}));}
 if(type==='suppliers'){const ss=await prisma.supplier.findMany({orderBy:{name:'asc'}}),out=[];for(const s of ss){const billWhere={supplierId:s.id,status:{not:'CANCELLED'}};if(dr)billWhere.billDate=dr;const b=await prisma.purchaseBill.aggregate({where:billWhere,_sum:{totalAmount:true,outstanding:true}});out.push({Code:s.supplierCode,Supplier:s.name,Opening:n(s.openingBalance),Purchases:n(b._sum.totalAmount),Outstanding:n(s.openingBalance)+n(b._sum.outstanding)});}return out;}
 if(type==='cheques'){const where={};if(dr)where.dateReceived=dr;return (await prisma.customerCheque.findMany({where,include:{customer:true,invoice:true},orderBy:{dateReceived:'asc'}})).map(x=>({Received:x.dateReceived,ChequeNo:x.chequeNo,Customer:x.customer.name,Invoice:x.invoice.invoiceNo,DrawerBank:x.drawerBank,ChequeDate:x.chequeDate,Expected:x.expectedPresentationDate,Status:x.status,Amount:n(x.amount)}));}
 throw new Error('Unknown report type.');}
r.get('/catalog',permit('BUSINESS_REPORT_VIEW'),async(req,res)=>{
  const rows=reportCatalogFor(req).map(([code,name,group])=>({code,name,group}));
  res.json(rows);
});

function excelColumnLetter(n){let x=n,out='';while(x){x--;out=String.fromCharCode(65+(x%26))+out;x=Math.floor(x/26)}return out;}
function reportTitle(type){return catalog.find(([code])=>code===type)?.[1]||type;}
function reportPeriod(q){
  const fmt=v=>{if(!v)return null;const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric'}).format(d)};
  const from=fmt(q.from),to=fmt(q.to);
  if(from&&to)return `${from} - ${to}`;
  if(from)return `From ${from}`;
  if(to)return `Up to ${to}`;
  return 'All available dates';
}
function isMoneyColumn(k){return /(amount|sales|paid|outstanding|balance|price|value|cost|opening|total|subtotal|discount|vat|refund|credit|debit|purchases|inflow|outflow|limit)$/i.test(k)}
function isIntegerColumn(k){return /^(invoices|items)$/i.test(k)}
function styleExcelReport(ws,rows,meta){
  const keys=rows.length?Object.keys(rows[0]):[];
  const columnCount=Math.max(keys.length,1),lastCol=excelColumnLetter(columnCount),headerRow=7;
  ws.mergeCells(`A1:${lastCol}1`); ws.getCell('A1').value=meta.companyName;
  ws.getCell('A1').font={bold:true,size:16,color:{argb:'FFFFFFFF'}}; ws.getCell('A1').alignment={horizontal:'center',vertical:'middle'};
  ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF162033'}}; ws.getRow(1).height=26;
  ws.mergeCells(`A2:${lastCol}2`); ws.getCell('A2').value=meta.reportName; ws.getCell('A2').font={bold:true,size:13}; ws.getCell('A2').alignment={horizontal:'center'};
  const details=[['Reporting Period',meta.period],['Generated On',meta.generatedOn],['Generated By',meta.generatedBy]];
  details.forEach((x,i)=>{const r=3+i;ws.getCell(r,1).value=x[0];ws.getCell(r,1).font={bold:true};if(columnCount>1){ws.mergeCells(r,2,r,columnCount);ws.getCell(r,2).value=x[1];}else ws.getCell(r,1).value=`${x[0]}: ${x[1]}`;});
  if(!rows.length){ws.getCell(headerRow,1).value='No records found for the selected reporting period.';ws.getCell(headerRow,1).font={italic:true};ws.getColumn(1).width=55;return;}
  keys.forEach((k,i)=>{const c=ws.getCell(headerRow,i+1);c.value=k;c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF243A5E'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border={top:{style:'thin',color:{argb:'FFB8C2D1'}},bottom:{style:'thin',color:{argb:'FFB8C2D1'}},left:{style:'thin',color:{argb:'FFB8C2D1'}},right:{style:'thin',color:{argb:'FFB8C2D1'}}};});
  rows.forEach((obj,idx)=>{const row=ws.getRow(headerRow+1+idx);keys.forEach((k,i)=>{const cell=row.getCell(i+1);cell.value=obj[k]??'';cell.alignment={vertical:'top',wrapText:false};cell.border={bottom:{style:'hair',color:{argb:'FFDDE3EB'}}};if(obj[k] instanceof Date){cell.numFmt='dd-mmm-yyyy';}else if(typeof obj[k]==='number'){if(isMoneyColumn(k))cell.numFmt='#,##0.00;[Red]-#,##0.00';else if(isIntegerColumn(k))cell.numFmt='0';else cell.numFmt='#,##0.###';}});});
  keys.forEach((k,i)=>{const vals=[k,...rows.slice(0,200).map(r=>{const v=r[k];if(v instanceof Date)return '00-Mmm-0000';return String(v??'')})];const longest=Math.max(...vals.map(v=>v.length));ws.getColumn(i+1).width=Math.min(Math.max(longest+2,12),38);});
  ws.getRow(headerRow).height=24; ws.views=[{state:'frozen',ySplit:headerRow}]; ws.autoFilter={from:`A${headerRow}`,to:`${lastCol}${headerRow}`};
  ws.pageSetup={orientation:columnCount>7?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
  ws.pageMargins={left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2};
  ws.headerFooter.oddFooter='&L'+meta.companyName+'&CPage &P of &N&RGenerated '+meta.generatedOn;
}

// IMPORTANT: Excel route must be declared before /:type so Express does not treat "sales.xlsx" as a report type.
r.get('/:type.xlsx',permit('BUSINESS_REPORT_VIEW'),async(req,res)=>{try{
  const type=String(req.params.type||'').replace(/\.xlsx$/i,'');
  assertReportAllowed(req,type);
  const [rows,settings]=await Promise.all([data(type,req.query),prisma.setting.findMany({where:{key:{in:['COMPANY_NAME','TIMEZONE']}}})]);
  const sm=Object.fromEntries(settings.map(x=>[x.key,x.value]));
  const companyName=sm.COMPANY_NAME||process.env.COMPANY_NAME||'DARILTWEENS NIGERIA LIMITED';
  const tz=sm.TIMEZONE||process.env.TIMEZONE||'Africa/Lagos';
  const generatedOn=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZone:tz,timeZoneName:'short'}).format(new Date());
  const fullName=[req.user?.firstName,req.user?.lastName].filter(Boolean).join(' ')||req.user?.email||'System User';
  const roles=(req.roles||[]).map(x=>x.replaceAll('_',' ')).join(', ');
  const generatedBy=roles?`${fullName} (${roles})`:fullName;
  const wb=new ExcelJS.Workbook(); wb.creator=fullName; wb.company=companyName; wb.created=new Date(); wb.modified=new Date();
  const ws=wb.addWorksheet('Report');
  styleExcelReport(ws,rows,{companyName,reportName:reportTitle(type),period:reportPeriod(req.query),generatedOn,generatedBy});
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${type}_report.xlsx"`);
  await wb.xlsx.write(res);res.end();
}catch(e){res.status(e.status||400).json({message:e.message})}});

r.get('/:type',permit('BUSINESS_REPORT_VIEW'),async(req,res)=>{try{
  const type=String(req.params.type||'');assertReportAllowed(req,type);
  const rows=await data(type,req.query);res.json({type,rows,count:rows.length});
}catch(e){res.status(e.status||400).json({message:e.message})}});
export default r;
