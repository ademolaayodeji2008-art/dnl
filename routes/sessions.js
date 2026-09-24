import { Router } from 'express';
import { prisma } from '../src/prisma.js';
import { auth,permit } from '../src/middleware.js';
import { audit } from '../src/utils.js';
const r=Router();r.use(auth);

r.get('/mine',async(req,res)=>{const rows=await prisma.userSession.findMany({where:{userId:req.user.id},orderBy:{lastSeenAt:'desc'}});res.json(rows.map(x=>({...x,current:x.sessionKey===req.sessionKey}))) });
r.post('/mine/:id/revoke',async(req,res)=>{try{const s=await prisma.userSession.findUnique({where:{id:req.params.id}});if(!s||s.userId!==req.user.id)throw new Error('Session not found.');const row=await prisma.userSession.update({where:{id:s.id},data:{revokedAt:new Date(),revokeReason:'User signed out this device'}});await audit(req.user.id,'REVOKE_OWN_SESSION','USER_SESSION',row.id,null,req.ip);res.json({message:'Session revoked.'})}catch(e){res.status(400).json({message:e.message})}});
r.get('/admin',permit('SESSION_MANAGE'),async(req,res)=>{const rows=await prisma.userSession.findMany({include:{user:{select:{firstName:true,lastName:true,email:true}}},orderBy:{lastSeenAt:'desc'},take:1000});res.json(rows.map(x=>({...x,current:x.sessionKey===req.sessionKey}))) });
r.post('/admin/:id/revoke',permit('SESSION_MANAGE'),async(req,res)=>{try{const row=await prisma.userSession.update({where:{id:req.params.id},data:{revokedAt:new Date(),revokeReason:String(req.body.reason||'Revoked by administrator').trim()}});await audit(req.user.id,'ADMIN_REVOKE_SESSION','USER_SESSION',row.id,{reason:row.revokeReason},req.ip);res.json({message:'Session revoked.'})}catch(e){res.status(400).json({message:e.message})}});
r.post('/admin/user/:userId/revoke-all',permit('SESSION_MANAGE'),async(req,res)=>{const out=await prisma.userSession.updateMany({where:{userId:req.params.userId,revokedAt:null},data:{revokedAt:new Date(),revokeReason:String(req.body.reason||'All sessions revoked by administrator').trim()}});await audit(req.user.id,'ADMIN_REVOKE_ALL_USER_SESSIONS','USER',req.params.userId,{count:out.count},req.ip);res.json({message:`${out.count} session(s) revoked.`})});
export default r;
