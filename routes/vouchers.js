import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { audit, nextPvNo, setting } from '../src/utils.js';
import { assertPeriodOpen } from '../src/accounting.js';
import { notifyRole, notifyUser, notifyUsers, money } from '../src/mailer.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const r=Router();
r.use(auth);
const uploadDir=path.resolve(process.env.UPLOAD_DIR||'uploads'); fs.mkdirSync(uploadDir,{recursive:true});
const allowedTypes=new Set(['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||10)*1024*1024,files:5},fileFilter:(req,file,cb)=>allowedTypes.has(file.mimetype)?cb(null,true):cb(new Error('Unsupported file type. Use PDF, JPG, PNG, WEBP, DOCX or XLSX.'))});

async function chooseWorkflow(amount,department){
  return prisma.approvalWorkflow.findFirst({
    where:{
      active:true,
      minAmount:{lte:amount},
      AND:[
        {OR:[{maxAmount:null},{maxAmount:{gte:amount}}]},
        {OR:[{department:null},{department:''},{department}]}
      ]
    },
    include:{levels:{where:{active:true},orderBy:{levelNo:'asc'}}},
    orderBy:{minAmount:'desc'}
  });
}
function publicVoucher(v){ return {...v,totalAmount:Number(v.totalAmount)}; }

function moneyVoucher(v){
  return {
    ...v,
    totalAmount:Number(v.totalAmount),
    items:(v.items||[]).map(i=>({...i,amount:Number(i.amount)})),
    payment:v.payment?{...v.payment,amount:Number(v.payment.amount)}:null
  };
}

async function userCanViewVoucher(req,voucher){
  if(!voucher) return false;
  if(voucher.raisedById===req.user.id) return true;
  if(req.roles.includes('SUPER_ADMIN') || req.permissions.includes('PV_VIEW_ALL')) return true;

  if(voucher.status==='PENDING_APPROVAL' && req.permissions.includes('PV_APPROVE')){
    const level=await prisma.approvalLevel.findFirst({
      where:{workflowId:voucher.workflowId,levelNo:voucher.currentLevelNo,active:true},
      include:{approvers:true}
    });
    if(level?.approvers.some(a=>a.userId===req.user.id&&a.active)) return true;
  }

  if(voucher.status==='APPROVED_PENDING_PAYMENT' && req.permissions.includes('PV_PAY')) return true;
  if(['PAID_AWAITING_CONFIRMATION','COMPLETED'].includes(voucher.status) && req.permissions.includes('PV_PAY')) return true;
  return false;
}

r.get('/options',async(req,res)=>{
  const categories=await prisma.expenseCategory.findMany({where:{active:true},orderBy:{name:'asc'}});
  const workflows=await prisma.approvalWorkflow.findMany({where:{active:true},orderBy:{name:'asc'}});
  res.json({
    categories,workflows,
    documentRequirements:{
      supporting:String(await setting('REQUIRE_SUPPORTING_DOCUMENT','FALSE')).toUpperCase()==='TRUE',
      paymentEvidence:String(await setting('REQUIRE_PAYMENT_EVIDENCE','FALSE')).toUpperCase()==='TRUE'
    }
  });
});

r.post('/',permit('PV_RAISE'),async(req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({message:'Add at least one expense line.'});
  const total=items.reduce((s,x)=>s+Number(x.amount||0),0);
  if(total<=0) return res.status(400).json({message:'Voucher amount must be greater than zero.'});
  const pvNo=await nextPvNo();
  const voucher=await prisma.voucher.create({
    data:{
      pvNo,raisedById:req.user.id,staffId:req.user.staffId||null,
      department:req.body.department||'',
      payee:req.body.payee, paymentType:req.body.paymentType||null,
      description:req.body.description,totalAmount:total,
      currency:req.body.currency||'NGN',
      dueDate:req.body.dueDate?new Date(req.body.dueDate):null,
      bankDetails:req.body.bankDetails||null,
      items:{create:items.map((x,i)=>({lineNo:i+1,categoryId:x.categoryId,description:x.description,amount:Number(x.amount)}))}
    },
    include:{items:true}
  });
  await audit(req.user.id,'CREATE_PV','VOUCHER',voucher.id,{pvNo},req.ip);
  res.json(publicVoucher(voucher));
});

r.post('/:id/submit',permit('PV_RAISE'),async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id},include:{attachments:true}});
  if(!voucher || voucher.raisedById!==req.user.id) return res.status(404).json({message:'Voucher not found.'});
  if(!['DRAFT','REJECTED'].includes(voucher.status)) return res.status(400).json({message:'Voucher cannot be submitted from its current status.'});
  if(String(await setting('REQUIRE_SUPPORTING_DOCUMENT','FALSE')).toUpperCase()==='TRUE'){
    const supportCount=(voucher.attachments||[]).filter(a=>a.attachmentType==='SUPPORTING').length;
    if(!supportCount) return res.status(400).json({message:'At least one supporting document is required before this voucher can be submitted.'});
  }
  const wf=await chooseWorkflow(Number(voucher.totalAmount),voucher.department);
  if(!wf||!wf.levels.length) return res.status(400).json({message:'No approval workflow matches this voucher.'});
  const row=await prisma.voucher.update({where:{id:voucher.id},data:{
    status:'PENDING_APPROVAL',workflowId:wf.id,currentLevelNo:wf.levels[0].levelNo,
    rejectionReason:null,submittedAt:new Date(),revision:voucher.status==='REJECTED'?voucher.revision+1:voucher.revision
  }});
  const firstLevel=await prisma.approvalLevel.findFirst({where:{workflowId:wf.id,levelNo:wf.levels[0].levelNo,active:true},include:{approvers:{where:{active:true}}}});
  await notifyUsers((firstLevel?.approvers||[]).map(a=>a.userId),'PV_SUBMITTED','New payment voucher awaiting approval',`${voucher.pvNo} has been submitted and requires your review.`,voucher.id,{'PV Number':voucher.pvNo,'Raised By':`${req.user.firstName} ${req.user.lastName}`,'Payee':voucher.payee,'Purpose':voucher.description,'Amount':money(voucher.totalAmount,voucher.currency)});
  res.json(row);
});

r.get('/mine',async(req,res)=>{
  const rows=await prisma.voucher.findMany({where:{raisedById:req.user.id},include:{items:{include:{category:true}},payment:true},orderBy:{createdAt:'desc'}});
  res.json(rows.map(publicVoucher));
});
r.get('/all',permit('PV_VIEW_ALL'),async(req,res)=>{
  const rows=await prisma.voucher.findMany({include:{raisedBy:true},orderBy:{createdAt:'desc'}});
  res.json(rows.map(publicVoucher));
});

r.get('/search/list',async(req,res)=>{
  const page=Math.max(1,Number(req.query.page||1)),take=Math.min(100,Math.max(10,Number(req.query.take||25))),skip=(page-1)*take;
  const where={};
  if(!req.permissions.includes('PV_VIEW_ALL')&&!req.roles.includes('SUPER_ADMIN')) where.raisedById=req.user.id;
  if(req.query.status)where.status=req.query.status;
  if(req.query.department)where.department={contains:String(req.query.department),mode:'insensitive'};
  if(req.query.from||req.query.to)where.createdAt={...(req.query.from?{gte:new Date(req.query.from)}:{}),...(req.query.to?{lte:new Date(req.query.to+'T23:59:59')}:{})};
  const q=String(req.query.q||'').trim(); if(q)where.OR=[{pvNo:{contains:q,mode:'insensitive'}},{payee:{contains:q,mode:'insensitive'}},{description:{contains:q,mode:'insensitive'}},{staffId:{contains:q,mode:'insensitive'}},{payment:{reference:{contains:q,mode:'insensitive'}}}];
  const [rows,total]=await Promise.all([prisma.voucher.findMany({where,include:{raisedBy:{select:{firstName:true,lastName:true,staffId:true}},payment:true},orderBy:{createdAt:'desc'},skip,take}),prisma.voucher.count({where})]);
  res.json({rows:rows.map(publicVoucher),total,page,pages:Math.ceil(total/take)});
});

r.get('/:id/details',async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({
    where:{id:req.params.id},
    include:{
      raisedBy:{select:{id:true,staffId:true,firstName:true,lastName:true,email:true}},
      items:{include:{category:true},orderBy:{lineNo:'asc'}},
      approvals:{
        include:{
          user:{select:{id:true,firstName:true,lastName:true,email:true}},
          level:{select:{id:true,levelNo:true,name:true,mode:true,minApprovals:true}}
        },
        orderBy:{actionAt:'asc'}
      },
      payment:{include:{paidBy:{select:{id:true,firstName:true,lastName:true,email:true}}}},
      attachments:{
        orderBy:{createdAt:'desc'},
        include:{uploadedBy:{select:{id:true,firstName:true,lastName:true,email:true}}}
      },
      workflow:{
        include:{
          levels:{orderBy:{levelNo:'asc'},include:{
            approvers:{where:{active:true},include:{
              user:{select:{id:true,firstName:true,lastName:true,email:true}}
            }}
          }}
        }
      }
    }
  });
  if(!voucher || !(await userCanViewVoucher(req,voucher)))
    return res.status(403).json({message:'You are not authorized to view this payment voucher.'});

  const editable=voucher.raisedById===req.user.id && ['DRAFT','REJECTED','PENDING_APPROVAL'].includes(voucher.status);
  res.json({
    ...moneyVoucher(voucher),editable,locked:!editable,
    documentRequirements:{
      supporting:String(await setting('REQUIRE_SUPPORTING_DOCUMENT','FALSE')).toUpperCase()==='TRUE',
      paymentEvidence:String(await setting('REQUIRE_PAYMENT_EVIDENCE','FALSE')).toUpperCase()==='TRUE'
    }
  });
});


r.post('/:id/attachments',upload.array('files',5),async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}});
  if(!voucher || !(await userCanViewVoucher(req,voucher))){
    for(const f of req.files||[])try{fs.unlinkSync(f.path)}catch{}
    return res.status(403).json({message:'Not authorized.'});
  }

  const attachmentType=String(req.query.type||req.body?.type||'SUPPORTING').toUpperCase()==='PAYMENT_EVIDENCE'
    ?'PAYMENT_EVIDENCE':'SUPPORTING';

  let canAdd=false;
  if(attachmentType==='SUPPORTING'){
    canAdd=voucher.raisedById===req.user.id&&['DRAFT','REJECTED','PENDING_APPROVAL'].includes(voucher.status);
  }else{
    canAdd=req.permissions.includes('PV_PAY')&&['APPROVED_PENDING_PAYMENT','PAID_AWAITING_CONFIRMATION'].includes(voucher.status);
  }

  if(!canAdd){
    for(const f of req.files||[])try{fs.unlinkSync(f.path)}catch{}
    return res.status(409).json({message:attachmentType==='PAYMENT_EVIDENCE'
      ?'Payment evidence can only be uploaded by an authorized Payable Officer before receipt confirmation.'
      :'Supporting documents are locked after approval.'});
  }

  if(!(req.files||[]).length) return res.status(400).json({message:'Select at least one file.'});

  const rows=[];
  for(const f of req.files||[]){
    rows.push(await prisma.voucherAttachment.create({data:{
      voucherId:voucher.id,fileName:f.originalname,filePath:f.path,mimeType:f.mimetype,
      attachmentType,uploadedById:req.user.id
    }}));
  }
  await audit(req.user.id,
    attachmentType==='PAYMENT_EVIDENCE'?'UPLOAD_PAYMENT_EVIDENCE':'UPLOAD_ATTACHMENT',
    'VOUCHER',voucher.id,{files:rows.map(x=>x.fileName),attachmentType},req.ip);
  res.json({rows});
});
r.get('/:id/attachments/:attachmentId/download',async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}}); if(!voucher||!(await userCanViewVoucher(req,voucher)))return res.status(403).json({message:'Not authorized.'});
  const f=await prisma.voucherAttachment.findFirst({where:{id:req.params.attachmentId,voucherId:voucher.id}}); if(!f||!fs.existsSync(f.filePath))return res.status(404).json({message:'Attachment not found.'});
  res.download(path.resolve(f.filePath),f.fileName);
});
r.delete('/:id/attachments/:attachmentId',async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}});
  if(!voucher || !(await userCanViewVoucher(req,voucher))) return res.status(403).json({message:'Not authorized.'});
  const f=await prisma.voucherAttachment.findFirst({where:{id:req.params.attachmentId,voucherId:voucher.id}});
  if(!f) return res.status(404).json({message:'Attachment not found.'});

  let canDelete=false;
  if(f.attachmentType==='PAYMENT_EVIDENCE'){
    canDelete=req.permissions.includes('PV_PAY')&&['APPROVED_PENDING_PAYMENT','PAID_AWAITING_CONFIRMATION'].includes(voucher.status);
  }else{
    canDelete=voucher.raisedById===req.user.id&&['DRAFT','REJECTED','PENDING_APPROVAL'].includes(voucher.status);
  }
  if(!canDelete) return res.status(409).json({message:'This document is locked and cannot be removed at the current workflow stage.'});

  await prisma.voucherAttachment.delete({where:{id:f.id}});
  try{fs.unlinkSync(f.filePath)}catch{}
  await audit(req.user.id,
    f.attachmentType==='PAYMENT_EVIDENCE'?'DELETE_PAYMENT_EVIDENCE':'DELETE_ATTACHMENT',
    'VOUCHER',voucher.id,{file:f.fileName,attachmentType:f.attachmentType},req.ip);
  res.json({message:'Attachment removed.'});
});

r.get('/:id/print-data',async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({
    where:{id:req.params.id},
    include:{
      raisedBy:{select:{firstName:true,lastName:true,email:true,staffId:true}},
      items:{include:{category:true},orderBy:{lineNo:'asc'}},
      approvals:{include:{user:{select:{firstName:true,lastName:true}},level:true},orderBy:{actionAt:'asc'}},
      payment:{include:{paidBy:{select:{firstName:true,lastName:true}}}}
    }
  });
  if(!voucher || !(await userCanViewVoucher(req,voucher)))return res.status(403).json({message:'Not authorized.'});
  const modern=Object.fromEntries((await prisma.setting.findMany()).map(x=>[x.key,x.value||'']));
  let legacy={};
  try{legacy=Object.fromEntries((await prisma.companySetting.findMany()).map(x=>[x.key,x.value||'']));}catch{}
  // Modern settings win for company text; legacy CompanySetting still supplies LOGO_URL.
  const settings={...legacy,...modern};
  res.json({voucher:moneyVoucher(voucher),settings});
});

r.put('/:id',permit('PV_RAISE'),async(req,res)=>{
  const current=await prisma.voucher.findUnique({
    where:{id:req.params.id},
    include:{items:true}
  });
  if(!current || current.raisedById!==req.user.id)
    return res.status(404).json({message:'Voucher not found.'});
  if(!['DRAFT','REJECTED','PENDING_APPROVAL'].includes(current.status))
    return res.status(409).json({message:'This voucher has been approved and is locked from editing.'});

  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({message:'Add at least one expense line.'});
  const total=items.reduce((s,x)=>s+Number(x.amount||0),0);
  if(total<=0) return res.status(400).json({message:'Voucher amount must be greater than zero.'});

  let workflowId=current.workflowId;
  let currentLevelNo=current.currentLevelNo;
  let revision=current.revision;
  let status=current.status;

  // Editing a submitted voucher creates a new approval revision and restarts approval.
  if(current.status==='PENDING_APPROVAL'){
    const wf=await chooseWorkflow(total,String(req.body.department||current.department));
    if(!wf||!wf.levels.length)
      return res.status(400).json({message:'No approval workflow matches the edited voucher.'});
    workflowId=wf.id;
    currentLevelNo=wf.levels[0].levelNo;
    revision=current.revision+1;
    status='PENDING_APPROVAL';
  }

  const updated=await prisma.$transaction(async tx=>{
    await tx.voucherItem.deleteMany({where:{voucherId:current.id}});
    return tx.voucher.update({
      where:{id:current.id},
      data:{
        payee:String(req.body.payee||'').trim(),
        department:String(req.body.department||'').trim(),
        paymentType:req.body.paymentType||null,
        description:String(req.body.description||'').trim(),
        totalAmount:total,
        currency:req.body.currency||current.currency||'NGN',
        dueDate:req.body.dueDate?new Date(req.body.dueDate):null,
        bankDetails:req.body.bankDetails||null,
        workflowId,currentLevelNo,revision,status,
        rejectionReason:current.status==='REJECTED'?null:current.rejectionReason,
        items:{create:items.map((x,i)=>({
          lineNo:i+1,categoryId:x.categoryId,description:String(x.description||'').trim(),amount:Number(x.amount)
        }))}
      },
      include:{items:{include:{category:true},orderBy:{lineNo:'asc'}}}
    });
  });

  await audit(req.user.id,'EDIT_PV','VOUCHER',current.id,{
    pvNo:current.pvNo,oldRevision:current.revision,newRevision:revision,status
  },req.ip);

  if(current.status==='PENDING_APPROVAL'){
    await notifyRole('ACCOUNT_OFFICER','PV_REVISED','Payment voucher revised',`${current.pvNo} was edited by the raiser and approval has restarted.`,current.id);
    await notifyRole('CEO','PV_REVISED','Payment voucher revised',`${current.pvNo} was edited by the raiser and approval has restarted.`,current.id);
  }
  res.json(moneyVoucher(updated));
});

r.get('/pending-approvals',permit('PV_APPROVE'),async(req,res)=>{
  const levels=await prisma.approvalAuthorizer.findMany({where:{userId:req.user.id,active:true},select:{levelId:true}});
  const levelRows=await prisma.approvalLevel.findMany({where:{id:{in:levels.map(x=>x.levelId)}}});
  const allowed=levelRows.map(x=>({workflowId:x.workflowId,levelNo:x.levelNo}));
  const rows=await prisma.voucher.findMany({where:{status:'PENDING_APPROVAL'},include:{raisedBy:true}});
  res.json(rows.filter(v=>allowed.some(a=>a.workflowId===v.workflowId&&a.levelNo===v.currentLevelNo)).map(publicVoucher));
});

r.post('/:id/approve',permit('PV_APPROVE'),async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}});
  if(!voucher||voucher.status!=='PENDING_APPROVAL') return res.status(404).json({message:'Pending voucher not found.'});
  const level=await prisma.approvalLevel.findFirst({where:{workflowId:voucher.workflowId,levelNo:voucher.currentLevelNo},include:{approvers:true}});
  if(!level||!level.approvers.some(a=>a.userId===req.user.id&&a.active)) return res.status(403).json({message:'You are not authorized for this approval level.'});
  const allowSelf=(await setting('ALLOW_SELF_APPROVAL','FALSE'))==='TRUE';
  if(!allowSelf&&voucher.raisedById===req.user.id) return res.status(403).json({message:'You cannot approve your own voucher.'});
  await prisma.approval.upsert({
    where:{voucherId_revision_levelId_userId:{voucherId:voucher.id,revision:voucher.revision,levelId:level.id,userId:req.user.id}},
    update:{action:'APPROVED',comments:req.body.comments||null,actionAt:new Date()},
    create:{voucherId:voucher.id,revision:voucher.revision,levelId:level.id,userId:req.user.id,action:'APPROVED',comments:req.body.comments||null}
  });
  const approvedCount=await prisma.approval.count({where:{voucherId:voucher.id,revision:voucher.revision,levelId:level.id,action:'APPROVED'}});
  const levelDone=level.mode==='ANY'?approvedCount>=level.minApprovals:approvedCount>=level.approvers.filter(a=>a.active).length;
  if(levelDone){
    const next=await prisma.approvalLevel.findFirst({where:{workflowId:voucher.workflowId,levelNo:{gt:level.levelNo},active:true},orderBy:{levelNo:'asc'}});
    if(next){
      await prisma.voucher.update({where:{id:voucher.id},data:{currentLevelNo:next.levelNo}});
      const nextLevel=await prisma.approvalLevel.findUnique({where:{id:next.id},include:{approvers:{where:{active:true}}}});
      await notifyUsers((nextLevel?.approvers||[]).map(a=>a.userId),'PV_NEXT_APPROVAL','Payment voucher awaiting your approval',`${voucher.pvNo} has moved to ${next.name}.`,voucher.id,{'PV Number':voucher.pvNo,'Payee':voucher.payee,'Amount':money(voucher.totalAmount,voucher.currency)});
    }
    else{
      await prisma.voucher.update({where:{id:voucher.id},data:{status:'APPROVED_PENDING_PAYMENT',approvedAt:new Date(),currentLevelNo:null}});
      await notifyRole('PAYABLE_OFFICER','PV_APPROVED','Voucher approved — payment required',`${voucher.pvNo} has completed approval and is ready for payment.`,voucher.id,{'PV Number':voucher.pvNo,'Payee':voucher.payee,'Amount':money(voucher.totalAmount,voucher.currency)});
    }
  }
  res.json({message:'Approval recorded.'});
});

r.post('/:id/reject',permit('PV_REJECT'),async(req,res)=>{
  const reason=String(req.body.reason||'').trim();
  if(!reason) return res.status(400).json({message:'Rejection reason is required.'});
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}});
  if(!voucher||voucher.status!=='PENDING_APPROVAL') return res.status(404).json({message:'Pending voucher not found.'});
  await prisma.voucher.update({where:{id:voucher.id},data:{status:'REJECTED',rejectionReason:reason,currentLevelNo:null}});
  await notifyUser(voucher.raisedById,'PV_REJECTED','Payment voucher rejected',`${voucher.pvNo} was rejected. Reason: ${reason}`,voucher.id,{'PV Number':voucher.pvNo,'Payee':voucher.payee,'Amount':money(voucher.totalAmount,voucher.currency),'Reason':reason});
  res.json({message:'Voucher rejected.'});
});

r.get('/pending-payments',permit('PV_PAY'),async(req,res)=>{
  const rows=await prisma.voucher.findMany({where:{status:'APPROVED_PENDING_PAYMENT'},include:{raisedBy:true},orderBy:{approvedAt:'asc'}});
  res.json(rows.map(publicVoucher));
});

r.post('/:id/pay',permit('PV_PAY'),async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id},include:{items:true,payment:true,attachments:true}});
  if(!voucher||voucher.status!=='APPROVED_PENDING_PAYMENT') return res.status(404).json({message:'Approved voucher not found.'});
  if(voucher.payment) return res.status(409).json({message:'This voucher has already been paid.'});
  if(String(await setting('REQUIRE_PAYMENT_EVIDENCE','FALSE')).toUpperCase()==='TRUE'){
    const evidenceCount=(voucher.attachments||[]).filter(a=>a.attachmentType==='PAYMENT_EVIDENCE').length;
    if(!evidenceCount) return res.status(400).json({message:'Payment evidence is required before this voucher can be marked paid.'});
  }
  const paymentDate=req.body.paymentDate?new Date(req.body.paymentDate):new Date();
  await assertPeriodOpen(paymentDate);
  await prisma.$transaction(async tx=>{
    await tx.payment.create({data:{
      voucherId:voucher.id,paymentDate,paymentMethod:req.body.paymentMethod||'Bank Transfer',
      paymentAccount:req.body.paymentAccount||null,reference:req.body.reference||null,
      amount:Number(voucher.totalAmount),comments:req.body.comments||null,paidById:req.user.id
    }});
    for(const item of voucher.items){
      await tx.expense.create({data:{
        date:paymentDate,voucherId:voucher.id,voucherItemId:item.id,categoryId:item.categoryId,
        description:item.description,payee:voucher.payee,department:voucher.department,
        amount:Number(item.amount),paymentReference:req.body.reference||null,paidById:req.user.id
      }});
    }
    await tx.voucher.update({where:{id:voucher.id},data:{status:'PAID_AWAITING_CONFIRMATION',paidAt:new Date()}});
  });
  await notifyUser(voucher.raisedById,'PV_PAID','Payment processed — confirm receipt',`${voucher.pvNo} has been paid. Please review the payment details and confirm receipt.`,voucher.id,{'PV Number':voucher.pvNo,'Payee':voucher.payee,'Amount':money(voucher.totalAmount,voucher.currency),'Payment Reference':req.body.reference||''});
  res.json({message:'Payment recorded and expenses posted.'});
});

r.post('/:id/confirm-receipt',permit('PV_CONFIRM_RECEIPT'),async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}});
  if(!voucher||voucher.raisedById!==req.user.id||voucher.status!=='PAID_AWAITING_CONFIRMATION')
    return res.status(400).json({message:'Voucher is not awaiting your confirmation.'});
  await prisma.voucher.update({where:{id:voucher.id},data:{status:'COMPLETED',receiptConfirmedAt:new Date()}});
  await Promise.all([notifyRole('PAYABLE_OFFICER','PV_COMPLETED','Payment receipt confirmed',`${voucher.pvNo} has been confirmed received by the raiser.`,voucher.id),notifyRole('FINANCE_MANAGER','PV_COMPLETED','Payment voucher completed',`${voucher.pvNo} is now completed.`,voucher.id)]);
  res.json({message:'Payment receipt confirmed.'});
});

r.post('/:id/terminate',permit('PV_RAISE'),async(req,res)=>{
  const voucher=await prisma.voucher.findUnique({where:{id:req.params.id}});
  if(!voucher||voucher.raisedById!==req.user.id||!['DRAFT','REJECTED'].includes(voucher.status))
    return res.status(400).json({message:'Voucher cannot be terminated.'});
  await prisma.voucher.update({where:{id:voucher.id},data:{status:'TERMINATED',terminationReason:req.body.reason||null}});
  res.json({message:'Voucher terminated.'});
});

export default r;
