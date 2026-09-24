import { Router } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo } from '../src/utils.js';
const r=Router();r.use(auth);const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024}});const n=v=>Number(v||0);const r2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
function sendBook(res,wb,name){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${name}"`);return wb.xlsx.write(res).then(()=>res.end())}
function headerMap(ws){const m={};ws.getRow(1).eachCell((c,i)=>m[String(c.value||'').trim().toLowerCase()]=i);return m}
function val(row,m,name){const c=m[name.toLowerCase()];return c?row.getCell(c).value:null}
function text(v){if(v&&typeof v==='object'&&v.text)return String(v.text);return String(v??'').trim()}
function date(v){if(!v)return null;if(v instanceof Date)return v;const d=new Date(v);return Number.isNaN(d.getTime())?null:d}

r.get('/customers/template',permit('CUSTOMER_CREATE'),async(req,res)=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Customers');ws.columns=['CustomerCode','Name','Phone','Email','Address','CreditLimit','OpeningBalance','OpeningBalanceDate','Active'].map(x=>({header:x,key:x,width:22}));ws.addRow({CustomerCode:'',Name:'Example Customer Ltd',Phone:'08000000000',Email:'customer@example.com',Address:'Lagos',CreditLimit:500000,OpeningBalance:0,OpeningBalanceDate:new Date(),Active:'TRUE'});await sendBook(res,wb,'customer_import_template.xlsx')});
r.get('/items/template',permit('ITEM_MANAGE'),async(req,res)=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Items');ws.columns=['ItemCode','Name','Category','BaseUnit','CostPrice','SellingPrice','ReorderLevel','OpeningStock','OpeningLocation','CartonConverter','BagConverter','Active'].map(x=>({header:x,key:x,width:20}));ws.addRow({ItemCode:'',Name:'Frozen Chicken',Category:'Frozen Food',BaseUnit:'KG',CostPrice:5000,SellingPrice:6000,ReorderLevel:20,OpeningStock:100,OpeningLocation:'Main Warehouse',CartonConverter:10,BagConverter:'',Active:'TRUE'});await sendBook(res,wb,'item_import_template.xlsx')});
r.get('/invoices/template',permit('INVOICE_CREATE'),async(req,res)=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Invoices');ws.columns=['InvoiceNo','CustomerCode','InvoiceDate','DueDate','ItemCode','SaleUnit','Quantity','Converter','UnitPrice','VATAmount','DiscountAmount','Notes'].map(x=>({header:x,key:x,width:20}));ws.addRow({InvoiceNo:'INV-IMPORT-001',CustomerCode:'CUS-00001',InvoiceDate:new Date(),DueDate:new Date(),ItemCode:'ITM-00001',SaleUnit:'CARTON',Quantity:2,Converter:10,UnitPrice:60000,VATAmount:0,DiscountAmount:0,Notes:'Imported invoice'});ws.addRow({InvoiceNo:'INV-IMPORT-001',CustomerCode:'CUS-00001',InvoiceDate:new Date(),DueDate:new Date(),ItemCode:'ITM-00002',SaleUnit:'KG',Quantity:5,Converter:1,UnitPrice:6000,VATAmount:0,DiscountAmount:0,Notes:'Imported invoice'});await sendBook(res,wb,'invoice_import_template.xlsx')});

r.get('/customers/export',permit('CUSTOMER_VIEW'),async(req,res)=>{const rows=await prisma.customer.findMany({orderBy:{name:'asc'}}),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Customers');ws.columns=['CustomerCode','Name','Phone','Email','Address','CreditLimit','OpeningBalance','OpeningBalanceDate','Active'].map(x=>({header:x,key:x,width:22}));for(const x of rows)ws.addRow({CustomerCode:x.customerCode,Name:x.name,Phone:x.phone,Email:x.email,Address:x.address,CreditLimit:n(x.creditLimit),OpeningBalance:n(x.openingBalance),OpeningBalanceDate:x.openingBalanceDate,Active:x.active});await sendBook(res,wb,'customers_export.xlsx')});
r.get('/items/export',permit('ITEM_VIEW'),async(req,res)=>{const rows=await prisma.inventoryItem.findMany({include:{conversions:true},orderBy:{name:'asc'}}),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Items');ws.columns=['ItemCode','Name','Category','BaseUnit','CostPrice','SellingPrice','ReorderLevel','OpeningStock','CurrentStock','Conversions','Active'].map(x=>({header:x,key:x,width:22}));for(const x of rows)ws.addRow({ItemCode:x.itemCode,Name:x.name,Category:x.category,BaseUnit:x.baseUnit,CostPrice:n(x.costPrice),SellingPrice:n(x.sellingPrice),ReorderLevel:n(x.reorderLevel),OpeningStock:n(x.openingStock),CurrentStock:n(x.currentStock),Conversions:x.conversions.map(c=>`${c.transactionUnit}:${n(c.converter)}`).join('; '),Active:x.active});await sendBook(res,wb,'items_export.xlsx')});
r.get('/invoices/export',permit('INVOICE_VIEW'),async(req,res)=>{const rows=await prisma.salesInvoice.findMany({include:{customer:true,lines:{include:{item:true}}},orderBy:{invoiceDate:'desc'}}),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Invoices');ws.columns=['InvoiceNo','InvoiceDate','DueDate','Status','CustomerCode','Customer','ItemCode','Item','SaleUnit','Quantity','Converter','StockQuantity','UnitPrice','LineAmount','VATAmount','InvoiceTotal','AmountPaid','Outstanding','Notes'].map(x=>({header:x,key:x,width:20}));for(const x of rows)for(const l of x.lines)ws.addRow({InvoiceNo:x.invoiceNo,InvoiceDate:x.invoiceDate,DueDate:x.dueDate,Status:x.status,CustomerCode:x.customer.customerCode,Customer:x.customer.name,ItemCode:l.item.itemCode,Item:l.item.name,SaleUnit:l.saleUnit,Quantity:n(l.quantity),Converter:n(l.converter),StockQuantity:n(l.stockQuantity),UnitPrice:n(l.unitPrice),LineAmount:n(l.amount),VATAmount:n(l.vatAmount),InvoiceTotal:n(x.totalAmount),AmountPaid:n(x.amountPaid),Outstanding:n(x.outstanding),Notes:x.notes});await sendBook(res,wb,'sales_invoices_export.xlsx')});

r.post('/customers/import',permit('CUSTOMER_CREATE'),upload.single('file'),async(req,res)=>{try{if(!req.file)throw new Error('Select an Excel file.');const wb=new ExcelJS.Workbook();await wb.xlsx.load(req.file.buffer);const ws=wb.worksheets[0],m=headerMap(ws);let created=0,updated=0,skipped=0;for(let i=2;i<=ws.rowCount;i++){const row=ws.getRow(i),name=text(val(row,m,'Name'));if(!name){skipped++;continue}let code=text(val(row,m,'CustomerCode')).toUpperCase();if(!code)code=(await nextSequenceNo('CUSTOMER','CUS',5)).replaceAll('/','-');const data={name,phone:text(val(row,m,'Phone'))||null,email:text(val(row,m,'Email')).toLowerCase()||null,address:text(val(row,m,'Address'))||null,creditLimit:n(val(row,m,'CreditLimit')),openingBalance:n(val(row,m,'OpeningBalance')),openingBalanceDate:date(val(row,m,'OpeningBalanceDate')),active:text(val(row,m,'Active')).toUpperCase()!=='FALSE'};const found=await prisma.customer.findUnique({where:{customerCode:code}});if(found){await prisma.customer.update({where:{id:found.id},data});updated++}else{await prisma.customer.create({data:{customerCode:code,...data,createdById:req.user.id}});created++}}await audit(req.user.id,'IMPORT_CUSTOMERS','CUSTOMER',null,{created,updated,skipped},req.ip);res.json({created,updated,skipped})}catch(e){res.status(400).json({message:e.message})}});

r.post('/items/import',permit('ITEM_MANAGE'),upload.single('file'),async(req,res)=>{
  try{
    if(!req.file)throw new Error('Select an Excel file.');

    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    const ws=wb.worksheets[0],m=headerMap(ws);

    if(!m['openinglocation']){
      throw new Error('The import file must contain an OpeningLocation column. Download the latest item import template.');
    }

    let created=0,updated=0,skipped=0;
    const errors=[];

    for(let i=2;i<=ws.rowCount;i++){
      try{
        const row=ws.getRow(i);
        const name=text(val(row,m,'Name'));

        if(!name){
          skipped++;
          errors.push(`Row ${i}: Item name is required.`);
          continue;
        }

        let code=text(val(row,m,'ItemCode')).toUpperCase();

        if(!code){
          code=(await nextSequenceNo('ITEM','ITM',5)).replaceAll('/','-');
        }

        const opening=n(val(row,m,'OpeningStock'));
        const openingLocation=text(val(row,m,'OpeningLocation'));
        const baseUnit=text(val(row,m,'BaseUnit')).toUpperCase()||'KG';

        if(opening<0){
          throw new Error('Opening stock cannot be negative.');
        }

        let location=null;

        if(opening>0){
          if(!openingLocation){
            throw new Error('OpeningLocation is required when OpeningStock is greater than zero.');
          }

          location=await prisma.inventoryLocation.findFirst({
            where:{
              active:true,
              OR:[
                {locationCode:{equals:openingLocation,mode:'insensitive'}},
                {name:{equals:openingLocation,mode:'insensitive'}}
              ]
            }
          });

          if(!location){
            throw new Error(`Opening location "${openingLocation}" was not found or is inactive.`);
          }
        }

        const found=await prisma.inventoryItem.findUnique({
          where:{itemCode:code}
        });

        const data={
          name,
          category:text(val(row,m,'Category'))||null,
          baseUnit,
          costPrice:n(val(row,m,'CostPrice')),
          sellingPrice:n(val(row,m,'SellingPrice')),
          reorderLevel:n(val(row,m,'ReorderLevel')),
          active:text(val(row,m,'Active')).toUpperCase()!=='FALSE'
        };

        let item;

        await prisma.$transaction(async tx=>{

          if(found){
            item=await tx.inventoryItem.update({
              where:{id:found.id},
              data
            });
            updated++;
          }else{
            item=await tx.inventoryItem.create({
              data:{
                itemCode:code,
                ...data,
                openingStock:0,
                currentStock:0,
                createdById:req.user.id
              }
            });
            created++;
          }

          if(opening>0){

            await tx.inventoryLocationBalance.upsert({
              where:{
                locationId_itemId:{
                  locationId:location.id,
                  itemId:item.id
                }
              },
              update:{
                quantity:{increment:opening}
              },
              create:{
                locationId:location.id,
                itemId:item.id,
                quantity:opening
              }
            });

            await tx.inventoryItem.update({
              where:{id:item.id},
              data:{
                openingStock:{increment:opening},
                currentStock:{increment:opening}
              }
            });

            const movementNo=await nextSequenceNo('STOCK','STK',7);

            await tx.stockMovement.create({
              data:{
                movementNo,
                movementDate:new Date(),
                itemId:item.id,
                type:'OPENING',
                quantity:opening,
                unit:baseUnit,
                converter:1,
                baseQuantity:opening,
                referenceType:'IMPORT_OPENING',
                referenceId:item.id,
                referenceNo:code,
                remarks:`Imported opening stock - ${location.name}`,
                locationId:location.id,
                createdById:req.user.id
              }
            });
          }

          for(const [col,unit] of [
            ['CartonConverter','CARTON'],
            ['BagConverter','BAG']
          ]){
            const conv=n(val(row,m,col));

            if(conv>0){
              const existing=await tx.itemConversion.findUnique({
                where:{
                  itemId_transactionUnit:{
                    itemId:item.id,
                    transactionUnit:unit
                  }
                }
              });

              const conversionCode=
                existing?.conversionCode||
                (await nextSequenceNo('CONVERSION','CONV',6)).replaceAll('/','-');

              await tx.itemConversion.upsert({
                where:{
                  itemId_transactionUnit:{
                    itemId:item.id,
                    transactionUnit:unit
                  }
                },
                update:{
                  converter:conv,
                  baseUnit:item.baseUnit,
                  active:true
                },
                create:{
                  conversionCode,
                  itemId:item.id,
                  baseUnit:item.baseUnit,
                  transactionUnit:unit,
                  converter:conv,
                  createdById:req.user.id
                }
              });
            }
          }
        });

      }catch(e){
        skipped++;
        errors.push(`Row ${i}: ${e.message}`);
      }
    }

    await audit(
      req.user.id,
      'IMPORT_ITEMS',
      'ITEM',
      null,
      {created,updated,skipped,errors:errors.slice(0,50)},
      req.ip
    );

    res.json({created,updated,skipped,errors});

  }catch(e){
    res.status(400).json({message:e.message});
  }
});
r.get('/purchases/template',permit('PURCHASE_IMPORT'),async(req,res)=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Purchase Bills');ws.columns=['BillNo','SupplierCode','SupplierInvoiceNo','BillDate','DueDate','ItemCode','PurchaseUnit','Quantity','Converter','UnitCost','VATAmount','DiscountAmount','Notes'].map(x=>({header:x,key:x,width:20}));ws.addRow({BillNo:'BILL-IMPORT-001',SupplierCode:'SUP-00001',SupplierInvoiceNo:'SUPINV-001',BillDate:new Date(),DueDate:new Date(),ItemCode:'ITM-00001',PurchaseUnit:'CARTON',Quantity:5,Converter:10,UnitCost:50000,VATAmount:0,DiscountAmount:0,Notes:'Imported purchase'});ws.addRow({BillNo:'BILL-IMPORT-001',SupplierCode:'SUP-00001',SupplierInvoiceNo:'SUPINV-001',BillDate:new Date(),DueDate:new Date(),ItemCode:'ITM-00002',PurchaseUnit:'KG',Quantity:10,Converter:1,UnitCost:4500,VATAmount:0,DiscountAmount:0,Notes:'Imported purchase'});await sendBook(res,wb,'purchase_bill_import_template.xlsx')});

r.get('/purchases/export',permit('PURCHASE_EXPORT'),async(req,res)=>{const where={};if(req.query.from||req.query.to){where.billDate={};if(req.query.from)where.billDate.gte=new Date(req.query.from+'T00:00:00');if(req.query.to)where.billDate.lte=new Date(req.query.to+'T23:59:59.999')}const rows=await prisma.purchaseBill.findMany({where,include:{supplier:true,lines:{include:{item:true}}},orderBy:{billDate:'desc'}}),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Purchase Bills');ws.columns=['BillNo','BillDate','DueDate','Status','SupplierCode','Supplier','SupplierInvoiceNo','ItemCode','Item','PurchaseUnit','Quantity','Converter','StockQuantity','UnitCost','LineAmount','VATAmount','BillTotal','AmountPaid','Outstanding','Notes'].map(x=>({header:x,key:x,width:20}));for(const x of rows)for(const l of x.lines)ws.addRow({BillNo:x.billNo,BillDate:x.billDate,DueDate:x.dueDate,Status:x.status,SupplierCode:x.supplier.supplierCode,Supplier:x.supplier.name,SupplierInvoiceNo:x.supplierInvoiceNo,ItemCode:l.item.itemCode,Item:l.item.name,PurchaseUnit:l.purchaseUnit,Quantity:n(l.quantity),Converter:n(l.converter),StockQuantity:n(l.stockQuantity),UnitCost:n(l.unitCost),LineAmount:n(l.amount),VATAmount:n(l.vatAmount),BillTotal:n(x.totalAmount),AmountPaid:n(x.amountPaid),Outstanding:n(x.outstanding),Notes:x.notes});await sendBook(res,wb,'purchase_bills_export.xlsx')});

r.post('/purchases/import',permit('PURCHASE_IMPORT'),upload.single('file'),async(req,res)=>{try{if(!req.file)throw new Error('Select an Excel file.');const wb=new ExcelJS.Workbook();await wb.xlsx.load(req.file.buffer);const ws=wb.worksheets[0],m=headerMap(ws),groups=new Map();for(let i=2;i<=ws.rowCount;i++){const row=ws.getRow(i),supplierCode=text(val(row,m,'SupplierCode')).toUpperCase(),itemCode=text(val(row,m,'ItemCode')).toUpperCase();if(!supplierCode||!itemCode)continue;const key=text(val(row,m,'BillNo'))||`ROW-${i}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({billNo:text(val(row,m,'BillNo')),supplierCode,supplierInvoiceNo:text(val(row,m,'SupplierInvoiceNo')),billDate:date(val(row,m,'BillDate'))||new Date(),dueDate:date(val(row,m,'DueDate')),itemCode,purchaseUnit:text(val(row,m,'PurchaseUnit')).toUpperCase(),quantity:n(val(row,m,'Quantity')),converter:n(val(row,m,'Converter')||1),unitCost:n(val(row,m,'UnitCost')),vatAmount:n(val(row,m,'VATAmount')),discountAmount:n(val(row,m,'DiscountAmount')),notes:text(val(row,m,'Notes'))})}let created=0,skipped=0;const errors=[];for(const [key,rows] of groups){try{const h=rows[0],supplier=await prisma.supplier.findUnique({where:{supplierCode:h.supplierCode}});if(!supplier||!supplier.active)throw new Error(`Supplier ${h.supplierCode} not found or inactive.`);let billNo=h.billNo;if(billNo&&await prisma.purchaseBill.findUnique({where:{billNo}})){skipped++;errors.push(`${billNo}: already exists`);continue}if(!billNo)billNo=await nextSequenceNo('PURCHASE_BILL','BILL',6);const prepared=[];let subtotal=0,vatAmount=0;for(const x of rows){const item=await prisma.inventoryItem.findUnique({where:{itemCode:x.itemCode}});if(!item)throw new Error(`Item ${x.itemCode} not found.`);if(x.quantity<=0||x.converter<=0||x.unitCost<0)throw new Error(`Invalid values for ${x.itemCode}.`);const amount=r2(x.quantity*x.unitCost),stockQuantity=x.quantity*x.converter;subtotal+=amount;vatAmount+=x.vatAmount;prepared.push({...x,item,amount,stockQuantity,grossAmount:r2(amount+x.vatAmount)})}const totalAmount=r2(subtotal-h.discountAmount+vatAmount),movementNos=[];for(const _ of prepared)movementNos.push(await nextSequenceNo('STOCK','STK',7));await prisma.$transaction(async tx=>{const bill=await tx.purchaseBill.create({data:{billNo,supplierId:supplier.id,supplierInvoiceNo:h.supplierInvoiceNo||null,billDate:h.billDate,dueDate:h.dueDate,subtotal:r2(subtotal),discountAmount:r2(h.discountAmount),vatAmount:r2(vatAmount),totalAmount,amountPaid:0,outstanding:totalAmount,notes:h.notes||null,createdById:req.user.id}});for(let i=0;i<prepared.length;i++){const l=prepared[i];await tx.purchaseBillLine.create({data:{billId:bill.id,lineNo:i+1,itemId:l.item.id,purchaseUnit:l.purchaseUnit||l.item.baseUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.stockQuantity,unitCost:l.unitCost,amount:l.amount,vatAmount:l.vatAmount,grossAmount:l.grossAmount}});const fresh=await tx.inventoryItem.findUnique({where:{id:l.item.id}}),oldStock=n(fresh.currentStock),oldCost=n(fresh.costPrice),baseUnitCost=l.unitCost/l.converter,newStock=oldStock+l.stockQuantity,weightedCost=newStock>0?((oldStock*oldCost)+(l.stockQuantity*baseUnitCost))/newStock:baseUnitCost;await tx.inventoryItem.update({where:{id:l.item.id},data:{currentStock:{increment:l.stockQuantity},costPrice:weightedCost}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:bill.billDate,itemId:l.item.id,type:'PURCHASE',quantity:l.quantity,unit:l.purchaseUnit||l.item.baseUnit,converter:l.converter,baseQuantity:l.stockQuantity,referenceType:'PURCHASE_BILL',referenceId:bill.id,referenceNo:billNo,remarks:`Imported purchase from ${supplier.name}`,createdById:req.user.id}})}});created++}catch(e){skipped++;errors.push(`${key}: ${e.message}`)}}await audit(req.user.id,'IMPORT_PURCHASE_BILLS','PURCHASE_BILL',null,{created,skipped,errors:errors.slice(0,25)},req.ip);res.json({created,skipped,errors})}catch(e){res.status(400).json({message:e.message})}});

r.post('/invoices/import',permit('INVOICE_CREATE'),upload.single('file'),async(req,res)=>{try{if(!req.file)throw new Error('Select an Excel file.');const wb=new ExcelJS.Workbook();await wb.xlsx.load(req.file.buffer);const ws=wb.worksheets[0],m=headerMap(ws),groups=new Map();for(let i=2;i<=ws.rowCount;i++){const row=ws.getRow(i),customerCode=text(val(row,m,'CustomerCode')).toUpperCase(),itemCode=text(val(row,m,'ItemCode')).toUpperCase();if(!customerCode||!itemCode)continue;const key=text(val(row,m,'InvoiceNo'))||`ROW-${i}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({customerCode,itemCode,invoiceNo:text(val(row,m,'InvoiceNo')),invoiceDate:date(val(row,m,'InvoiceDate'))||new Date(),dueDate:date(val(row,m,'DueDate')),saleUnit:text(val(row,m,'SaleUnit')).toUpperCase()||'KG',quantity:n(val(row,m,'Quantity')),converter:n(val(row,m,'Converter')||1),unitPrice:n(val(row,m,'UnitPrice')),vatAmount:r2(val(row,m,'VATAmount')),discountAmount:r2(val(row,m,'DiscountAmount')),notes:text(val(row,m,'Notes'))})}let created=0;for(const rows of groups.values()){const first=rows[0],customer=await prisma.customer.findUnique({where:{customerCode:first.customerCode}});if(!customer)throw new Error(`Customer ${first.customerCode} not found.`);let invoiceNo=first.invoiceNo;if(invoiceNo&&await prisma.salesInvoice.findUnique({where:{invoiceNo}}))throw new Error(`Invoice ${invoiceNo} already exists.`);if(!invoiceNo)invoiceNo=await nextSequenceNo('INVOICE','INV',6);const lines=[];let subtotal=0,vat=0;for(let i=0;i<rows.length;i++){const x=rows[i],item=await prisma.inventoryItem.findUnique({where:{itemCode:x.itemCode}});if(!item)throw new Error(`Item ${x.itemCode} not found.`);const base=x.quantity*x.converter;if(x.quantity<=0||x.converter<=0||n(item.currentStock)<base)throw new Error(`Invalid or insufficient stock for ${item.name}.`);const amount=r2(x.quantity*x.unitPrice);subtotal+=amount;vat+=x.vatAmount;lines.push({...x,item,base,amount,lineNo:i+1})}const discount=r2(first.discountAmount),total=r2(subtotal-discount+vat),movementNos=[];for(const _ of lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));await prisma.$transaction(async tx=>{const inv=await tx.salesInvoice.create({data:{invoiceNo,customerId:customer.id,invoiceDate:first.invoiceDate,dueDate:first.dueDate,status:'ISSUED',subtotal:r2(subtotal),discountAmount:discount,vatAmount:r2(vat),totalAmount:total,amountPaid:0,outstanding:total,notes:first.notes||null,salespersonId:req.user.id,createdById:req.user.id}});for(let i=0;i<lines.length;i++){const l=lines[i];await tx.salesInvoiceLine.create({data:{invoiceId:inv.id,lineNo:l.lineNo,itemId:l.item.id,saleUnit:l.saleUnit,quantity:l.quantity,converter:l.converter,stockQuantity:l.base,unitPrice:l.unitPrice,amount:l.amount,vatAmount:l.vatAmount,grossAmount:r2(l.amount+l.vatAmount)}});await tx.inventoryItem.update({where:{id:l.item.id},data:{currentStock:{decrement:l.base}}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:first.invoiceDate,itemId:l.item.id,type:'SALE',quantity:l.quantity,unit:l.saleUnit,converter:l.converter,baseQuantity:l.base,referenceType:'IMPORTED_INVOICE',referenceId:inv.id,referenceNo:invoiceNo,remarks:`Imported sale to ${customer.name}`,createdById:req.user.id}})}});created++}await audit(req.user.id,'IMPORT_INVOICES','SALES_INVOICE',null,{created},req.ip);res.json({created})}catch(e){res.status(400).json({message:e.message})}});

export default r;


