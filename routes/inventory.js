import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextSequenceNo } from '../src/utils.js';
import { assertPeriodOpen } from '../src/accounting.js';

const r=Router();
r.use(auth);
const n=v=>Number(v||0);

r.get('/items',permit('ITEM_VIEW'),async(req,res)=>{
  const rows=await prisma.inventoryItem.findMany({include:{conversions:{where:{active:true},orderBy:{transactionUnit:'asc'}},locationBalances:{include:{location:true}}},orderBy:{name:'asc'}});
  res.json({rows:rows.map(x=>({...x,costPrice:n(x.costPrice),sellingPrice:n(x.sellingPrice),reorderLevel:n(x.reorderLevel),openingStock:n(x.openingStock),currentStock:n(x.currentStock),conversions:x.conversions.map(c=>({...c,converter:n(c.converter)})),locations:x.locationBalances.map(b=>({locationId:b.locationId,name:b.location.name,address:b.location.address,active:b.location.active,quantity:n(b.quantity)}))})),count:rows.length});
});

r.post('/items',permit('ITEM_MANAGE'),async(req,res)=>{
  const name=String(req.body.name||'').trim(); if(!name)return res.status(400).json({message:'Item name is required.'});
  const itemCode=String(req.body.itemCode||'').trim().toUpperCase() || (await nextSequenceNo('ITEM','ITM',5)).replaceAll('/','-');
  const opening=n(req.body.openingStock);
  const movementNo=opening?await nextSequenceNo('STOCK','STK',7):null;
  const units=(Array.isArray(req.body.conversions)?req.body.conversions:[]).map(u=>({transactionUnit:String(u.transactionUnit||'').trim().toUpperCase(),converter:n(u.converter)})).filter(u=>u.transactionUnit&&u.converter>0);
  for(const u of units)u.conversionCode=(await nextSequenceNo('CONVERSION','CONV',6)).replaceAll('/','-');
  const row=await prisma.$transaction(async tx=>{
    const item=await tx.inventoryItem.create({data:{itemCode,name,category:String(req.body.category||'').trim()||null,baseUnit:String(req.body.baseUnit||'KG').trim().toUpperCase(),costPrice:n(req.body.costPrice),sellingPrice:n(req.body.sellingPrice),reorderLevel:n(req.body.reorderLevel),openingStock:opening,currentStock:opening,createdById:req.user.id}});
    if(opening){const main=await tx.inventoryLocation.findFirst({where:{active:true},orderBy:{createdAt:'asc'}});if(!main)throw new Error('Create an inventory location before entering opening stock.');await tx.inventoryLocationBalance.upsert({where:{locationId_itemId:{locationId:main.id,itemId:item.id}},update:{quantity:{increment:opening}},create:{locationId:main.id,itemId:item.id,quantity:opening}});await tx.stockMovement.create({data:{movementNo,movementDate:new Date(),itemId:item.id,type:'OPENING',quantity:opening,unit:item.baseUnit,converter:1,baseQuantity:opening,referenceType:'OPENING',referenceId:item.id,referenceNo:itemCode,remarks:'Opening stock',locationId:main.id,createdById:req.user.id}});}
    for(const u of units)await tx.itemConversion.create({data:{conversionCode:u.conversionCode,itemId:item.id,baseUnit:item.baseUnit,transactionUnit:u.transactionUnit,converter:u.converter,createdById:req.user.id}});
    return item;
  });
  await audit(req.user.id,'CREATE_ITEM','ITEM',row.id,{itemCode,name,openingStock:opening},req.ip);res.json(row);
});


r.put('/items/:id',permit('ITEM_MANAGE'),async(req,res)=>{try{const cur=await prisma.inventoryItem.findUnique({where:{id:req.params.id}});if(!cur)throw new Error('Item not found.');const row=await prisma.inventoryItem.update({where:{id:cur.id},data:{name:String(req.body.name??cur.name).trim(),category:String(req.body.category??cur.category??'').trim()||null,sellingPrice:req.body.sellingPrice===undefined?cur.sellingPrice:n(req.body.sellingPrice),reorderLevel:req.body.reorderLevel===undefined?cur.reorderLevel:n(req.body.reorderLevel),active:req.body.active===undefined?cur.active:Boolean(req.body.active)}});await audit(req.user.id,'UPDATE_ITEM','ITEM',row.id,{name:row.name,active:row.active},req.ip);res.json(row)}catch(e){res.status(400).json({message:e.message})}});

r.post('/items/:id/conversions',permit('ITEM_MANAGE'),async(req,res)=>{
  const item=await prisma.inventoryItem.findUnique({where:{id:req.params.id}});if(!item)return res.status(404).json({message:'Item not found.'});
  const unit=String(req.body.transactionUnit||'').trim().toUpperCase(),converter=n(req.body.converter);if(!unit||converter<=0)return res.status(400).json({message:'Valid transaction unit and converter are required.'});
  const existing=await prisma.itemConversion.findUnique({where:{itemId_transactionUnit:{itemId:item.id,transactionUnit:unit}}});
  const code=existing?.conversionCode || (await nextSequenceNo('CONVERSION','CONV',6)).replaceAll('/','-');
  const row=await prisma.itemConversion.upsert({where:{itemId_transactionUnit:{itemId:item.id,transactionUnit:unit}},update:{converter,baseUnit:item.baseUnit,active:true},create:{conversionCode:code,itemId:item.id,baseUnit:item.baseUnit,transactionUnit:unit,converter,createdById:req.user.id}});
  await audit(req.user.id,'UPSERT_ITEM_CONVERSION','ITEM',item.id,{unit,converter},req.ip);res.json({...row,converter:n(row.converter)});
});

r.get('/movements',permit('INVENTORY_VIEW'),async(req,res)=>{
  const where={};if(req.query.itemId)where.itemId=req.query.itemId;
  const rows=await prisma.stockMovement.findMany({where,include:{item:{select:{itemCode:true,name:true}}},orderBy:{movementDate:'desc'},take:1000});
  res.json(rows.map(x=>({...x,quantity:n(x.quantity),converter:n(x.converter),baseQuantity:n(x.baseQuantity)})));
});

r.post('/adjustments',permit('STOCK_ADJUST'),async(req,res)=>{
  const lines=Array.isArray(req.body.lines)?req.body.lines:[];if(!lines.length)return res.status(400).json({message:'At least one adjustment line is required.'});
  const reason=String(req.body.reason||'').trim();if(!reason)return res.status(400).json({message:'Adjustment reason is required.'});
  const adjustmentDate=req.body.adjustmentDate?new Date(req.body.adjustmentDate):new Date();await assertPeriodOpen(adjustmentDate);const adjustmentNo=await nextSequenceNo('STOCK_ADJ','ADJ',6);
  const movementNos=[];for(let i=0;i<lines.length;i++)movementNos.push(await nextSequenceNo('STOCK','STK',7));
  const row=await prisma.$transaction(async tx=>{
    const adj=await tx.stockAdjustment.create({data:{adjustmentNo,adjustmentDate,reason,remarks:String(req.body.remarks||'').trim()||null,createdById:req.user.id}});
    for(let i=0;i<lines.length;i++){
      const l=lines[i],item=await tx.inventoryItem.findUnique({where:{id:l.itemId}});if(!item)throw new Error('Item not found in adjustment.');
      const locationId=String(l.locationId||'');const loc=await tx.inventoryLocation.findUnique({where:{id:locationId}});if(!loc||!loc.active)throw new Error('Select an active stock location for every adjustment.');const direction=String(l.direction||'').toUpperCase();if(!['IN','OUT'].includes(direction))throw new Error('Adjustment direction must be IN or OUT.');
      const qty=n(l.quantity),converter=n(l.converter||1),base=qty*converter;if(qty<=0||converter<=0)throw new Error('Adjustment quantity and converter must be greater than zero.');
      const lb=await tx.inventoryLocationBalance.findUnique({where:{locationId_itemId:{locationId,itemId:item.id}}});if(direction==='OUT'&&n(lb?.quantity)<base)throw new Error(`Insufficient ${item.name} at ${loc.name}.`);if(direction==='OUT'&&n(item.currentStock)<base)throw new Error(`Insufficient company stock for ${item.name}.`);
      await tx.stockAdjustmentLine.create({data:{adjustmentId:adj.id,lineNo:i+1,itemId:item.id,locationId,direction,quantity:qty,unit:String(l.unit||item.baseUnit).toUpperCase(),converter,baseQuantity:base}});
      await tx.inventoryItem.update({where:{id:item.id},data:{currentStock:{[direction==='IN'?'increment':'decrement']:base}}});await tx.inventoryLocationBalance.upsert({where:{locationId_itemId:{locationId,itemId:item.id}},update:{quantity:{[direction==='IN'?'increment':'decrement']:base}},create:{locationId,itemId:item.id,quantity:direction==='IN'?base:-base}});
      await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:adj.adjustmentDate,itemId:item.id,locationId,type:direction==='IN'?'ADJUSTMENT_IN':'ADJUSTMENT_OUT',quantity:qty,unit:String(l.unit||item.baseUnit).toUpperCase(),converter,baseQuantity:base,referenceType:'STOCK_ADJUSTMENT',referenceId:adj.id,referenceNo:adjustmentNo,remarks:reason,createdById:req.user.id}});
    }
    return adj;
  });
  await audit(req.user.id,'CREATE_STOCK_ADJUSTMENT','STOCK_ADJUSTMENT',row.id,{adjustmentNo,reason,lines:lines.length},req.ip);res.json(row);
});


r.get('/issues',permit('INVENTORY_ISSUE_VIEW'),async(req,res)=>{
  const where={};if(req.query.from||req.query.to){where.issueDate={};if(req.query.from)where.issueDate.gte=new Date(req.query.from+'T00:00:00');if(req.query.to)where.issueDate.lte=new Date(req.query.to+'T23:59:59.999')}if(req.query.issueType)where.issueType=req.query.issueType;
  const rows=await prisma.inventoryIssue.findMany({where,include:{lines:{include:{item:{select:{itemCode:true,name:true,baseUnit:true}}}}},orderBy:{issueDate:'desc'},take:1500});
  res.json(rows.map(x=>({...x,totalCost:n(x.totalCost),lines:x.lines.map(l=>({...l,quantity:n(l.quantity),converter:n(l.converter),baseQuantity:n(l.baseQuantity),unitCost:n(l.unitCost),lineCost:n(l.lineCost)}))})));
});

r.post('/issues',permit('INVENTORY_ISSUE_CREATE'),async(req,res)=>{try{
  const issueType=String(req.body.issueType||'').toUpperCase(),allowed=['PR_SAMPLE','REGULATORY_CUSTOMS','EXPIRED_WRITE_OFF','DAMAGED_WRITE_OFF','OTHER_AUTHORIZED'];if(!allowed.includes(issueType))throw new Error('Select a valid inventory issue type.');
  const reason=String(req.body.reason||'').trim();if(!reason)throw new Error('Reason is required.');if(issueType==='REGULATORY_CUSTOMS'&&!String(req.body.recipientAgency||'').trim())throw new Error('Recipient / regulatory agency is required for this issue type.');if(issueType==='REGULATORY_CUSTOMS'&&!String(req.body.authorizationRef||'').trim())throw new Error('Authorization/reference number is required for regulatory/customs issues.');const lines=Array.isArray(req.body.lines)?req.body.lines:[];if(!lines.length)throw new Error('At least one item is required.');
  const issueDate=req.body.issueDate?new Date(req.body.issueDate):new Date();await assertPeriodOpen(issueDate);const issueNo=await nextSequenceNo('INVENTORY_ISSUE','ISS',6),movementNos=[];for(const _ of lines)movementNos.push(await nextSequenceNo('STOCK','STK',7));
  const result=await prisma.$transaction(async tx=>{let totalCost=0;const prepared=[];for(let i=0;i<lines.length;i++){const l=lines[i],item=await tx.inventoryItem.findUnique({where:{id:String(l.itemId||'')}});if(!item)throw new Error('Inventory item not found.');const locationId=String(l.locationId||'');const loc=await prisma.inventoryLocation.findUnique({where:{id:locationId}});if(!loc||!loc.active)throw new Error(`Select an active stock location for ${item.name}.`);const quantity=n(l.quantity),converter=n(l.converter||1),baseQuantity=quantity*converter;if(quantity<=0||converter<=0)throw new Error(`Invalid quantity for ${item.name}.`);const lb=await prisma.inventoryLocationBalance.findUnique({where:{locationId_itemId:{locationId,itemId:item.id}}});if(n(lb?.quantity)<baseQuantity)throw new Error(`Insufficient stock for ${item.name} at ${loc.name}. Available ${n(lb?.quantity)} ${item.baseUnit}.`);if(n(item.currentStock)<baseQuantity)throw new Error(`Insufficient company stock for ${item.name}.`);const unitCost=n(item.costPrice),lineCost=Math.round((baseQuantity*unitCost+Number.EPSILON)*100)/100;totalCost+=lineCost;prepared.push({item,locationId,quantity,converter,baseQuantity,unit:String(l.unit||item.baseUnit).toUpperCase(),unitCost,lineCost})}
    const issue=await tx.inventoryIssue.create({data:{issueNo,issueDate,issueType,recipientAgency:String(req.body.recipientAgency||'').trim()||null,authorizationRef:String(req.body.authorizationRef||'').trim()||null,reason,remarks:String(req.body.remarks||'').trim()||null,totalCost,createdById:req.user.id}});
    for(let i=0;i<prepared.length;i++){const l=prepared[i];await tx.inventoryIssueLine.create({data:{issueId:issue.id,lineNo:i+1,itemId:l.item.id,quantity:l.quantity,unit:l.unit,converter:l.converter,baseQuantity:l.baseQuantity,unitCost:l.unitCost,lineCost:l.lineCost}});await tx.inventoryItem.update({where:{id:l.item.id},data:{currentStock:{decrement:l.baseQuantity}}});await tx.inventoryLocationBalance.update({where:{locationId_itemId:{locationId:l.locationId,itemId:l.item.id}},data:{quantity:{decrement:l.baseQuantity}}});await tx.stockMovement.create({data:{movementNo:movementNos[i],movementDate:issue.issueDate,itemId:l.item.id,locationId:l.locationId,type:'ADJUSTMENT_OUT',quantity:l.quantity,unit:l.unit,converter:l.converter,baseQuantity:l.baseQuantity,referenceType:'INVENTORY_ISSUE',referenceId:issue.id,referenceNo:issueNo,remarks:`${issueType}: ${reason}`,createdById:req.user.id}})}
    return {...issue,totalCost};
  });
  await audit(req.user.id,'CREATE_INVENTORY_ISSUE','INVENTORY_ISSUE',result.id,{issueNo,issueType,totalCost:result.totalCost,recipientAgency:req.body.recipientAgency||null,authorizationRef:req.body.authorizationRef||null,lines:lines.length},req.ip);res.json(result);
}catch(e){res.status(400).json({message:e.message})}});

export default r;
