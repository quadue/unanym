import {mkdirSync,copyFileSync,readFileSync,existsSync,readdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
process.umask(0o077);
if(!process.argv[2] || !process.argv[3])throw new Error('Usage: node scripts/restore.js BACKUP EMPTY_DESTINATION');
const source=resolve(process.argv[2]),target=resolve(process.argv[3]);
if(existsSync(target) && readdirSync(target).length)throw new Error('Restore requires a new empty destination');
const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json')));
if(!['drop-identity-backup-v1','community-identity-backup-v1','frrn-account-identity-backup-v1'].includes(manifest.format))throw new Error('Unknown backup format');
const standalone=manifest.format==='community-identity-backup-v1',frrn=manifest.format==='frrn-account-identity-backup-v1';
const allowed=['identity.db','keys.json','clients.json','client-secrets.json',...(standalone?['accounts.db','profile.json']:frrn?['profile.json','frrn-sources.json']:[])];
for(const name of ['identity.db','keys.json','clients.json',...(standalone?['accounts.db','profile.json']:frrn?['profile.json','frrn-sources.json']:[])])if(!manifest.files?.[name])throw new Error('Incomplete backup');
for(const [name,hash] of Object.entries(manifest.files)){
  if(!allowed.includes(name) || createHash('sha256').update(readFileSync(resolve(source,name))).digest('hex')!==hash)throw new Error('Backup integrity check failed');
}
mkdirSync(target,{recursive:true,mode:0o700});chmodSync(target,0o700);
for(const name of Object.keys(manifest.files)){copyFileSync(resolve(source,name),resolve(target,name));chmodSync(resolve(target,name),0o600);}
console.log(standalone?'Restored standalone accounts and identity snapshot. Preserve issuer, client IDs and operator settings; restore SMTP configuration separately.':'Restored verified identity snapshot. Restore the account backend separately; preserve issuer and client IDs before starting.');
