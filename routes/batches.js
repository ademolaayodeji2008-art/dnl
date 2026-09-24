import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth,permit } from '../src/middleware.js';
import { audit,nextSequenceNo } from '../src/utils.js';
import { num } from '../src/accounting.js';

const r=Router();
r.use(auth);

r.get('/',permit('BATCH_VIEW'),async(req,res)=>{
  const where={};
  if(req.query.itemId)where.itemId=req.query.itemId;
  if(req.query.locationId)where.locationId=req.query.locationId;
  if(req.query.status)where.status=req.query.status;
  const rows=await prisma.inventoryBatch.findMany({where,include:{item:true,location:true},orderBy:[{expiryDate:'asc'},{createdAt:'desc'}],take:1000});
  res.json(rows.map(x=>({...x,quantity:num(x.quantity),unitCost:num(x.unitCost)})));
});

r.get('/alerts',permit('BATCH_VIEW'),async(req,res)=>{
  const days=Math.max(1,Number(req.query.days||60)),now=new Date(),to=new Date(Date.now()+days*86400000);
  const rows=await prisma.inventoryBatch.findMany({where:{status:'ACTIVE',expiryDate:{gte:now,lte:to},quantity:{gt:0}},include:{item:true,location:true},orderBy:{expiryDate:'asc'}});
  res.json(rows.map(x=>({...x,quantity:num(x.quantity),unitCost:num(x.unitCost)})));
});

r.post('/',permit('BATCH_MANAGE'),async(req,res)=>{try{
  const item=await prisma.inventoryItem.findUnique({where:{id:String(req.body.itemId||'')}});
  const location=await prisma.inventoryLocation.findUnique({where:{id:String(req.body.locationId||'')}});
  if(!item||!location)throw new Error('Valid item and location are required.');
  const batchNo=String(req.body.batchNo||'').trim();
  if(!batchNo)throw new Error('Batch / lot number is required.');
  const quantity=num(req.body.quantity);
  if(quantity<0)throw new Error('Batch quantity cannot be negative.');
  const bal=await prisma.inventoryLocationBalance.findUnique({where:{locationId_itemId:{locationId:location.id,itemId:item.id}}});
  const tracked=await prisma.inventoryBatch.aggregate({where:{itemId:item.id,locationId:location.id,status:{not:'DEPLETED'}},_sum:{quantity:true}});
  const available=Math.max(0,num(bal?.quantity)-num(tracked._sum.quantity));
  if(quantity>available+0.0001)throw new Error(`Batch quantity cannot exceed unallocated stock at ${location.name}. Available: ${available} ${item.baseUnit}.`);
  const batchCode=(await nextSequenceNo('BATCH','BAT',6)).replaceAll('/','-');
  const status=String(req.body.status||'ACTIVE').toUpperCase();
  if(!['ACTIVE','QUARANTINED','EXPIRED','DEPLETED'].includes(status))throw new Error('Invalid batch status.');
  const row=await prisma.inventoryBatch.create({data:{batchCode,itemId:item.id,locationId:location.id,batchNo,manufactureDate:req.body.manufactureDate?new Date(req.body.manufactureDate):null,expiryDate:req.body.expiryDate?new Date(req.body.expiryDate):null,quantity,unitCost:req.body.unitCost===undefined?item.costPrice:num(req.body.unitCost),status,notes:String(req.body.notes||'').trim()||null,createdById:req.user.id}});
  await audit(req.user.id,'CREATE_INVENTORY_BATCH','INVENTORY_BATCH',row.id,{batchCode,batchNo,itemId:item.id,locationId:location.id,quantity},req.ip);
  res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

r.patch('/:id',permit('BATCH_MANAGE'),async(req,res)=>{try{
  const cur=await prisma.inventoryBatch.findUnique({where:{id:req.params.id}});
  if(!cur)throw new Error('Batch not found.');
  const data={};
  if(req.body.manufactureDate!==undefined)data.manufactureDate=req.body.manufactureDate?new Date(req.body.manufactureDate):null;
  if(req.body.expiryDate!==undefined)data.expiryDate=req.body.expiryDate?new Date(req.body.expiryDate):null;
  if(req.body.status!==undefined){const status=String(req.body.status).toUpperCase();if(!['ACTIVE','QUARANTINED','EXPIRED','DEPLETED'].includes(status))throw new Error('Invalid batch status.');data.status=status;}
  if(req.body.notes!==undefined)data.notes=String(req.body.notes||'').trim()||null;
  const row=await prisma.inventoryBatch.update({where:{id:cur.id},data});
  await audit(req.user.id,'UPDATE_INVENTORY_BATCH','INVENTORY_BATCH',row.id,{status:row.status},req.ip);
  res.json(row);
}catch(e){res.status(400).json({message:e.message})}});

export default r;
