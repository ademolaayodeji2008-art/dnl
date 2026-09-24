import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../src/prisma.js';
import { comparePassword,hashPassword,signToken,assertStrongPassword,randomToken,tokenHash } from '../src/security.js';
import { auth as requireAuth } from '../src/middleware.js';
import { audit,setting } from '../src/utils.js';
import { sendAccountSecurityEmail } from '../src/mailer.js';

const r=Router();
const verifyLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false});
const resetLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false});
const baseUrl=()=>String(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'');
function ttlMs(v,fallback){const m=String(v||'').trim().match(/^(\d+)([smhd])$/i);if(!m)return fallback;const n=Number(m[1]),u=m[2].toLowerCase();return n*({s:1000,m:60000,h:3600000,d:86400000}[u]||1)}
async function emailVerificationRequired(){return String(await setting('REQUIRE_EMAIL_VERIFICATION','FALSE')).toUpperCase()==='TRUE';}
async function issueToken(userId,type,minutes=30){
  const raw=randomToken(32);
  await prisma.accountToken.create({data:{userId,type,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+minutes*60000)}});
  return raw;
}
async function consumeToken(raw,type){
  const row=await prisma.accountToken.findUnique({where:{tokenHash:tokenHash(raw)}});
  if(!row||row.type!==type||row.usedAt||row.expiresAt<new Date())return null;
  await prisma.accountToken.update({where:{id:row.id},data:{usedAt:new Date()}});
  return row;
}

r.post('/login',async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  const user=await prisma.user.findUnique({where:{email}});
  if(!user)return res.status(401).json({message:'Invalid email or password.'});
  if(user.lockedUntil&&user.lockedUntil>new Date())return res.status(423).json({message:'Account temporarily locked.'});
  const ok=await comparePassword(password,user.passwordHash);
  if(!ok){
    const maxAttempts=Math.max(3,Number(await setting('LOGIN_MAX_ATTEMPTS','5'))||5),lockMinutes=Math.max(1,Number(await setting('LOCKOUT_MINUTES','15'))||15),attempts=user.failedAttempts+1;
    await prisma.user.update({where:{id:user.id},data:{failedAttempts:attempts,lockedUntil:attempts>=maxAttempts?new Date(Date.now()+lockMinutes*60000):null}});
    await audit(user.id,'FAILED_LOGIN','USER',user.id,{attempts,maxAttempts,locked:attempts>=maxAttempts},req.ip);
    return res.status(401).json({message:'Invalid email or password.'});
  }
  const verifyRequired=await emailVerificationRequired();
  if(verifyRequired&&!user.emailVerifiedAt&&user.status==='PENDING_VERIFICATION')
    return res.status(403).json({message:'Verify your email address before signing in.'});
  if(user.status!=='ACTIVE')return res.status(403).json({message:'Your account is not active.'});
  await prisma.user.update({where:{id:user.id},data:{failedAttempts:0,lockedUntil:null,lastLogin:new Date()}});
  const fresh=await prisma.user.findUnique({where:{id:user.id}});
  const expiryDays=Number(await setting('PASSWORD_EXPIRY_DAYS','0'))||0;
  const passwordExpired=expiryDays>0&&fresh.passwordChangedAt&&Date.now()-new Date(fresh.passwordChangedAt).getTime()>expiryDays*86400000;
  const remember=!!req.body.rememberMe,sessionKey=randomToken(24),ttl=remember?ttlMs(process.env.REMEMBER_EXPIRES_IN||'30d',30*86400000):ttlMs(process.env.JWT_EXPIRES_IN||'8h',8*3600000);
  await prisma.userSession.create({data:{sessionKey,userId:fresh.id,userAgent:String(req.headers['user-agent']||'').slice(0,500)||null,ipHint:req.ip,expiresAt:new Date(Date.now()+ttl)}});
  const token=signToken(fresh,remember,sessionKey);
  await audit(user.id,'LOGIN','USER',user.id,{sessionKey},req.ip);
  res.json({token,mustChangePassword:!!fresh.mustChangePassword||passwordExpired});
});

r.get('/staff/:staffId',async(req,res)=>{
  const staff=await prisma.staff.findUnique({where:{staffId:req.params.staffId.toUpperCase()}});
  if(!staff||staff.status!=='ACTIVE')return res.status(404).json({message:'Staff ID not found.'});
  res.json({staffId:staff.staffId,firstName:staff.firstName,lastName:staff.lastName,department:staff.department,position:staff.position,registered:staff.registered});
});

r.post('/register-staff',async(req,res)=>{
  const staffId=String(req.body.staffId||'').trim().toUpperCase();
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  assertStrongPassword(password);
  const staff=await prisma.staff.findUnique({where:{staffId}});
  if(!staff||staff.status!=='ACTIVE')return res.status(404).json({message:'Staff ID not found or inactive.'});
  if(staff.registered)return res.status(409).json({message:'This Staff ID is already registered.'});
  if(await prisma.user.findUnique({where:{email}}))return res.status(409).json({message:'Email already registered.'});
  const requireVerification=await emailVerificationRequired();
  const user=await prisma.$transaction(async tx=>{
    const u=await tx.user.create({data:{
      staffId,firstName:staff.firstName,lastName:staff.lastName,email,
      passwordHash:await hashPassword(password),status:requireVerification?'PENDING_VERIFICATION':'ACTIVE',
      emailVerifiedAt:requireVerification?null:new Date(),mustChangePassword:false,passwordChangedAt:new Date()
    }});
    const role=await tx.role.findUnique({where:{code:'STAFF'}});
    await tx.userRole.create({data:{userId:u.id,roleId:role.id}});
    await tx.staff.update({where:{staffId},data:{registered:true}});
    return u;
  });
  if(requireVerification){
    const token=await issueToken(user.id,'EMAIL_VERIFY',30);
    await sendAccountSecurityEmail(email,'Verify your Payment Voucher account','Verify your email',
      'Your staff registration is complete. Verify this email address to activate your account.',
      'Verify Email',`${baseUrl()}/?verify=${encodeURIComponent(token)}`);
  }
  await audit(user.id,'REGISTER_STAFF','USER',user.id,{staffId,email,requiresVerification:requireVerification},req.ip);
  res.json({message:requireVerification?'Registration successful. Check your email to verify your account.':'Registration successful. You can now log in.'});
});

r.post('/verify-email',verifyLimiter,async(req,res)=>{
  const row=await consumeToken(String(req.body.token||''),'EMAIL_VERIFY');
  if(!row)return res.status(400).json({message:'Verification link is invalid or expired.'});
  const user=await prisma.user.update({where:{id:row.userId},data:{emailVerifiedAt:new Date(),status:'ACTIVE'}});
  await audit(user.id,'EMAIL_VERIFIED','USER',user.id,null,req.ip);
  res.json({message:'Email verified successfully. You can now sign in.'});
});

r.post('/resend-verification',verifyLimiter,async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  const user=await prisma.user.findUnique({where:{email}});
  if(user&&user.status==='PENDING_VERIFICATION'&&!user.emailVerifiedAt){
    const token=await issueToken(user.id,'EMAIL_VERIFY',30);
    await sendAccountSecurityEmail(email,'Verify your Payment Voucher account','Verify your email',
      'Use this new verification link. It expires in 30 minutes.','Verify Email',`${baseUrl()}/?verify=${encodeURIComponent(token)}`);
    await audit(user.id,'RESEND_EMAIL_VERIFICATION','USER',user.id,null,req.ip);
  }
  res.json({message:'If the account is awaiting verification, a new verification email has been sent.'});
});

r.post('/forgot-password',resetLimiter,async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  const user=await prisma.user.findUnique({where:{email}});
  if(user&&user.status!=='INACTIVE'){
    const token=await issueToken(user.id,'PASSWORD_RESET',30);
    await sendAccountSecurityEmail(email,'Reset your Payment Voucher password','Reset your password',
      'Use the link below to choose a new password. The link expires in 30 minutes.',
      'Reset Password',`${baseUrl()}/?reset=${encodeURIComponent(token)}`);
    await audit(user.id,'PASSWORD_RESET_REQUEST','USER',user.id,null,req.ip);
  }
  res.json({message:'If the email exists, password-reset instructions have been sent.'});
});

r.post('/reset-password',resetLimiter,async(req,res)=>{
  const password=String(req.body.password||'');assertStrongPassword(password);
  const row=await consumeToken(String(req.body.token||''),'PASSWORD_RESET');
  if(!row)return res.status(400).json({message:'Password reset link is invalid or expired.'});
  const user=await prisma.user.findUnique({where:{id:row.userId}});
  if(!user)return res.status(404).json({message:'User not found.'});
  if(await comparePassword(password,user.passwordHash))return res.status(400).json({message:'Choose a password different from your current password.'});
  await prisma.user.update({where:{id:user.id},data:{passwordHash:await hashPassword(password),mustChangePassword:false,passwordChangedAt:new Date()}});
  await audit(user.id,'PASSWORD_RESET_COMPLETE','USER',user.id,null,req.ip);
  res.json({message:'Password reset successfully. Please sign in.'});
});

r.get('/me',requireAuth,async(req,res)=>{
  res.json({id:req.user.id,staffId:req.user.staffId,firstName:req.user.firstName,lastName:req.user.lastName,
    email:req.user.email,theme:req.user.theme,roles:req.roles,permissions:req.permissions,
    mustChangePassword:!!req.user.mustChangePassword,emailVerified:!!req.user.emailVerifiedAt});
});

r.post('/change-password',requireAuth,async(req,res)=>{
  const current=String(req.body.currentPassword||''),password=String(req.body.newPassword||'');
  assertStrongPassword(password);
  const user=await prisma.user.findUnique({where:{id:req.user.id}});
  if(!user)return res.status(404).json({message:'User not found.'});
  if(!(await comparePassword(current,user.passwordHash)))return res.status(400).json({message:'Current password is incorrect.'});
  if(await comparePassword(password,user.passwordHash))return res.status(400).json({message:'New password must be different from the current password.'});
  await prisma.user.update({where:{id:user.id},data:{passwordHash:await hashPassword(password),mustChangePassword:false,passwordChangedAt:new Date()}});
  await audit(user.id,'CHANGE_PASSWORD','USER',user.id,{forced:!!user.mustChangePassword},req.ip);
  res.json({message:'Password changed successfully. Please sign in again.'});
});

r.post('/logout',requireAuth,async(req,res)=>{try{if(req.sessionKey)await prisma.userSession.updateMany({where:{sessionKey:req.sessionKey,revokedAt:null},data:{revokedAt:new Date(),revokeReason:'User logout'}});await audit(req.user.id,'LOGOUT','USER',req.user.id,null,req.ip);res.json({message:'Signed out.'})}catch(e){res.status(400).json({message:e.message})}});

export default r;
