import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const file=process.argv[2];
if(!file||!fs.existsSync(file)){console.error('Usage: npm run restore -- backups/file.dump');process.exit(1)}
if(process.env.ALLOW_DB_RESTORE!=='YES'){console.error('Set ALLOW_DB_RESTORE=YES to acknowledge that restore can overwrite database objects.');process.exit(1)}
if(!process.env.DATABASE_URL){console.error('DATABASE_URL missing');process.exit(1)}
const r=spawnSync('pg_restore',['--clean','--if-exists','--no-owner','--dbname',process.env.DATABASE_URL,file],{stdio:'inherit',shell:true});
if(r.status!==0)process.exit(r.status||1);console.log('Restore completed. Run acceptance checks before use.');
