import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';
import { sendTestEmail } from '../src/mailer.js';

const r=Router(); r.use(auth);
function requireSuperAdmin(req,res,next){
  if(!(req.roles||[]).includes('SUPER_ADMIN')) return res.status(403).json({message:'Super Admin access required.'});
  next();
}

r.get('/',permit('SETTINGS_MANAGE'),requireSuperAdmin,async(req,res)=>{
  const rows=await prisma.setting.findMany();
  const modern=Object.fromEntries(rows.map(x=>[x.key,x.value]));
  let legacy={};
  try{legacy=Object.fromEntries((await prisma.companySetting.findMany()).map(x=>[x.key,x.value]));}catch{}
  res.json({...legacy,...modern});
});
r.put('/',permit('SETTINGS_MANAGE'),requireSuperAdmin,async(req,res)=>{
  for(const [key,value] of Object.entries(req.body||{})){
    await prisma.setting.upsert({where:{key},update:{value:String(value)},create:{key,value:String(value)}});
  }
  res.json({message:'Settings saved.'});
});
r.post('/test-email',permit('SETTINGS_MANAGE'),requireSuperAdmin,async(req,res)=>{
  const to=String(req.body?.email||req.user.email||'').trim();
  if(!to) return res.status(400).json({message:'Enter an email address.'});
  await sendTestEmail(to);
  res.json({message:'Test email sent successfully.'});
});
r.put('/theme',async(req,res)=>{
  const theme=req.body.theme==='dark'?'dark':'light';
  await prisma.user.update({where:{id:req.user.id},data:{theme}});
  res.json({theme});
});
r.get('/notifications',async(req,res)=>{
  const rows=await prisma.notification.findMany({where:{userId:req.user.id},orderBy:{createdAt:'desc'},take:50});
  const unread=await prisma.notification.count({where:{userId:req.user.id,isRead:false}});
  res.json({rows,unread});
});
r.get('/notifications/unread-count',async(req,res)=>{
  res.json({unread:await prisma.notification.count({where:{userId:req.user.id,isRead:false}})});
});
r.post('/notifications/read-all',async(req,res)=>{
  await prisma.notification.updateMany({where:{userId:req.user.id,isRead:false},data:{isRead:true,readAt:new Date()}});
  res.json({message:'All notifications marked as read.'});
});
r.post('/notifications/:id/read',async(req,res)=>{
  await prisma.notification.updateMany({where:{id:req.params.id,userId:req.user.id},data:{isRead:true,readAt:new Date()}});
  res.json({message:'Read.'});
});
export default r;
