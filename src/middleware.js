import { prisma } from './prisma.js';
import { verifyToken } from './security.js';

export async function auth(req,res,next){
  try{
    const header=req.headers.authorization||'';
    const token=header.startsWith('Bearer ')?header.slice(7):null;
    if(!token) return res.status(401).json({message:'Authentication required.'});
    const payload=verifyToken(token);
    const user=await prisma.user.findUnique({
      where:{id:payload.sub},
      include:{roles:{where:{active:true},include:{role:{include:{permissions:{where:{allowed:true},include:{permission:true}}}}}}}
    });
    if(!user||user.status!=='ACTIVE') return res.status(401).json({message:'Account is inactive.'});
    req.sessionKey=payload.sid||null;
    if(payload.sid){
      const session=await prisma.userSession.findUnique({where:{sessionKey:payload.sid}});
      if(!session||session.revokedAt||session.expiresAt<new Date()||session.userId!==user.id)return res.status(401).json({message:'This session has been signed out. Please sign in again.'});
      if(Date.now()-new Date(session.lastSeenAt).getTime()>5*60*1000)await prisma.userSession.update({where:{id:session.id},data:{lastSeenAt:new Date()}});
    }
    const expiryDays=Number((await prisma.setting.findUnique({where:{key:'PASSWORD_EXPIRY_DAYS'}}))?.value||0);
    if(expiryDays>0&&user.passwordChangedAt&&Date.now()-new Date(user.passwordChangedAt).getTime()>expiryDays*86400000)user.mustChangePassword=true;
    const tokenPwd=Number(payload.pwd||0);
    const currentPwd=user.passwordChangedAt?new Date(user.passwordChangedAt).getTime():0;
    if(tokenPwd!==currentPwd) return res.status(401).json({message:'Your session is no longer valid. Please sign in again.'});
    req.user=user;
    req.roles=user.roles.map(x=>x.role.code);
    req.permissions=[...new Set(user.roles.flatMap(x=>x.role.permissions.map(p=>p.permission.code)))];
    const allowedDuringForcedChange=['/api/auth/me','/api/auth/change-password','/api/settings/theme'];
    if(user.mustChangePassword&&!allowedDuringForcedChange.some(p=>req.originalUrl.startsWith(p))){
      return res.status(428).json({code:'PASSWORD_CHANGE_REQUIRED',message:'You must change your temporary password before continuing.'});
    }
    next();
  }catch(e){ return res.status(401).json({message:'Session expired. Please log in again.'}); }
}
export function permit(code){
  return (req,res,next)=>req.permissions.includes(code)||req.roles.includes('SUPER_ADMIN')
    ? next()
    : res.status(403).json({message:'You are not authorized for this action.'});
}
