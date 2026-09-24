import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export function signToken(user, remember=false, sessionKey=null) {
  return jwt.sign({
    sub:user.id,email:user.email,sid:sessionKey||undefined,
    pwd:user.passwordChangedAt?new Date(user.passwordChangedAt).getTime():0
  }, process.env.JWT_SECRET, {
    expiresIn: remember ? (process.env.REMEMBER_EXPIRES_IN || '30d') : (process.env.JWT_EXPIRES_IN || '8h')
  });
}
export function verifyToken(token){ return jwt.verify(token,process.env.JWT_SECRET); }
export const hashPassword=p=>bcrypt.hash(p,12);
export const comparePassword=(p,h)=>bcrypt.compare(p,h);

export function passwordPolicy(password){
  const p=String(password||''),errors=[];
  if(p.length<10)errors.push('at least 10 characters');
  if(!/[A-Z]/.test(p))errors.push('one uppercase letter');
  if(!/[a-z]/.test(p))errors.push('one lowercase letter');
  if(!/[0-9]/.test(p))errors.push('one number');
  if(!/[^A-Za-z0-9]/.test(p))errors.push('one special character');
  return {valid:errors.length===0,errors};
}
export function assertStrongPassword(password){
  const r=passwordPolicy(password);
  if(!r.valid){const e=new Error(`Password must contain ${r.errors.join(', ')}.`);e.status=400;throw e;}
}
export function randomToken(bytes=32){return crypto.randomBytes(bytes).toString('hex');}
export function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex');}
export function generateTemporaryPassword(){
  const upper='ABCDEFGHJKLMNPQRSTUVWXYZ',lower='abcdefghijkmnopqrstuvwxyz',nums='23456789',special='!@#$%&*?';
  const all=upper+lower+nums+special,pick=s=>s[crypto.randomInt(0,s.length)];
  let out=pick(upper)+pick(lower)+pick(nums)+pick(special);
  while(out.length<12)out+=pick(all);
  return out.split('').sort(()=>crypto.randomInt(0,3)-1).join('');
}
