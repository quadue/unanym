import Database from 'better-sqlite3';
import {mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {dataLock} from '../src/standalone/lock.js';
process.umask(0o077);
if(!process.argv[2])throw new Error('Give an absolute restricted backup destination');
const dir=resolve(process.argv[2]),source=resolve(process.env.IDENTITY_DATA_DIR??'data');
if(existsSync(dir) && readdirSync(dir).length)throw new Error('Use a new empty backup directory; existing snapshots are never overwritten');
const standalone=existsSync(resolve(source,'accounts.db'));
const profile=existsSync(resolve(source,'profile.json'))?JSON.parse(readFileSync(resolve(source,'profile.json'),'utf8')):null;
const frrn=profile?.account_source==='frrn';
if(frrn && (!process.env.FRRN_MEMBERSHIP_SOURCES || standalone))throw new Error('FRRN backup requires its source binding file and no standalone account store');
const release=profile?dataLock(source):()=>{};
try{
mkdirSync(dir,{recursive:true,mode:0o700});
const db=new Database(resolve(source,'identity.db'),{readonly:true,fileMustExist:true});
await db.backup(resolve(dir,'identity.db'));db.close();
copyFileSync(resolve(source,'keys.json'),resolve(dir,'keys.json'));
copyFileSync(resolve(process.env.IDENTITY_CLIENTS??'clients.json'),resolve(dir,'clients.json'));
const files=['identity.db','keys.json','clients.json'];
if(standalone){
  const accounts=new Database(resolve(source,'accounts.db'),{readonly:true,fileMustExist:true});
  await accounts.backup(resolve(dir,'accounts.db'));accounts.close();
  files.push('accounts.db');
}
if(profile){copyFileSync(resolve(source,'profile.json'),resolve(dir,'profile.json'));files.push('profile.json');}
if(frrn){copyFileSync(resolve(process.env.FRRN_MEMBERSHIP_SOURCES),resolve(dir,'frrn-sources.json'));files.push('frrn-sources.json');}
if(process.env.IDENTITY_CLIENT_SECRETS){copyFileSync(resolve(process.env.IDENTITY_CLIENT_SECRETS),resolve(dir,'client-secrets.json'));files.push('client-secrets.json');}
writeFileSync(resolve(dir,'manifest.json'),JSON.stringify({format:frrn?'frrn-account-identity-backup-v1':standalone?'community-identity-backup-v1':'drop-identity-backup-v1',created:new Date().toISOString(),files:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(resolve(dir,file))).digest('hex')]))},null,2),{mode:0o600});
writeFileSync(resolve(dir,'README.txt'),'Restore databases, keys and client registry together. This contains private signing material. Keep encrypted off-host copies. '+(standalone?'Preserve the issuer, operator settings and separate SMTP configuration.':'Pact must be restored separately.')+'\n',{mode:0o600});
console.log('Created a consistent private backup. Off-host replication is still required.');
}finally{release();}
