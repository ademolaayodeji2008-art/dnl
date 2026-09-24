import nodemailer from 'nodemailer';
import { prisma } from './prisma.js';

async function setting(key,fallback=''){
  return (await prisma.setting.findUnique({where:{key}}))?.value ?? fallback;
}
function transport(){
  if(!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT||587),
    secure:String(process.env.SMTP_SECURE||'false').toLowerCase()==='true',
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
}
function appLink(voucherId){
  const base=String(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'');
  return voucherId?`${base}/?pv=${encodeURIComponent(voucherId)}`:base;
}
export function money(v,currency='NGN'){
  try{return new Intl.NumberFormat('en-NG',{style:'currency',currency,maximumFractionDigits:2}).format(Number(v||0))}
  catch{return `${currency} ${Number(v||0).toLocaleString()}`}
}
function emailHtml(title,message,meta={},voucherId=null){
  const rows=Object.entries(meta).filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>`<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#667085">${k}</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">${String(v)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:26px"><h2 style="color:#172033">${title}</h2><p style="color:#475467;line-height:1.6">${message}</p>${rows?`<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>`:''}<a href="${appLink(voucherId)}" style="display:inline-block;background:#3056d3;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px">Open Payment Voucher System</a></div></div>`;
}
export async function notifyUser(userId,type,title,message,voucherId=null,meta={}){
  const note=await prisma.notification.create({data:{userId,type,title,message,voucherId}});
  const enabled=(await setting('EMAIL_NOTIFICATIONS_ENABLED','FALSE'))==='TRUE';
  if(!enabled) return note;
  const user=await prisma.user.findUnique({where:{id:userId}}),tx=transport();
  if(!user?.email||!tx) return note;
  try{await tx.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:user.email,subject:title,html:emailHtml(title,message,meta,voucherId)})}
  catch(e){console.error('Email send failed:',e.message)}
  return note;
}
export async function notifyRole(roleCode,type,title,message,voucherId=null,meta={}){
  const users=await prisma.user.findMany({where:{status:'ACTIVE',roles:{some:{active:true,role:{code:roleCode}}}}});
  return Promise.all(users.map(u=>notifyUser(u.id,type,title,message,voucherId,meta)));
}
export async function notifyUsers(userIds,type,title,message,voucherId=null,meta={}){
  return Promise.all([...new Set((userIds||[]).filter(Boolean))].map(id=>notifyUser(id,type,title,message,voucherId,meta)));
}
export async function sendTestEmail(to){
  if((await setting('EMAIL_NOTIFICATIONS_ENABLED','FALSE'))!=='TRUE') throw new Error('Email notifications are disabled in Settings.');
  const tx=transport(); if(!tx) throw new Error('SMTP is incomplete in .env. Configure SMTP_HOST, SMTP_USER and SMTP_PASS.');
  await tx.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject:'Payment Voucher Pro — Test Email',html:emailHtml('Email setup is working','This is a test email from Payment Voucher Pro.')});
}

export async function sendAccountSecurityEmail(to,subject,title,message,actionLabel,actionUrl){
  const tx=transport();
  if(!tx) throw new Error('Email delivery is not configured for account verification.');
  await tx.sendMail({
    from:process.env.SMTP_FROM||process.env.SMTP_USER,
    to,subject,
    html:`<div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px"><div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;padding:26px;border:1px solid #e5e7eb"><h2 style="margin-top:0">${title}</h2><p style="line-height:1.6;color:#475467">${message}</p><p><a href="${actionUrl}" style="display:inline-block;background:#3056d3;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px">${actionLabel}</a></p><p style="font-size:12px;color:#667085">If you did not request this action, contact your administrator.</p></div></div>`
  });
}
