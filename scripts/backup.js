import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const dir=path.resolve('backups');fs.mkdirSync(dir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(dir,`payment_voucher_${stamp}.dump`);
const url=process.env.DATABASE_URL;
if(!url){console.error('DATABASE_URL missing');process.exit(1)}
const r=spawnSync('pg_dump',['--format=custom','--file',out,url],{stdio:'inherit',shell:true});
if(r.status!==0){console.error('Backup failed. Ensure pg_dump is on PATH.');process.exit(r.status||1)}
console.log(`Backup created: ${out}`);
