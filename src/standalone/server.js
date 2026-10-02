import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {configuration} from '../config.js';
import {createService} from '../service.js';
import {standaloneAccounts,emailAddress} from './accounts.js';
import {standaloneRoutes} from './routes.js';
import {smtpMailer} from './mail.js';
import {dataLock} from './lock.js';
import {accountPasskeys} from './passkeys.js';
import {displayName} from '../presentation.js';

export function createStandalone(config,{bootstrapEmail,sendCode}) {
  if(config.basePath && config.basePath!=='/identity')throw new Error('Standalone accounts use the default identity path');
  if(config.contract!=='community-v1')throw new Error('Standalone hosts require community-v1');
  emailAddress(bootstrapEmail);
  const release=dataLock(config.dir);let accounts,service,passkeys;
  try{
    const path=resolve(config.dir,'profile.json');
    if(existsSync(path)){
      const profile=JSON.parse(readFileSync(path,'utf8'));
      if(profile.contract!==config.contract||profile.issuer!==config.issuer||(profile.account_source && profile.account_source!=='standalone'))throw new Error('Preserve the contract and issuer; migration must be explicit');
    }else{
      if(existsSync(resolve(config.dir,'identity.db')))throw new Error('Use a new data directory for standalone v1; do not relabel legacy records');
      writeFileSync(path,JSON.stringify({contract:config.contract,issuer:config.issuer,account_source:'standalone'}),{mode:0o600,flag:'wx'});
    }
    accounts=standaloneAccounts({dir:config.dir,key:config.keys.cookie,bootstrapEmail,sendCode,cookieName:config.origin.startsWith('https:')?'__Host-community_account':'community_account'});
    passkeys=accountPasskeys(accounts,{origin:config.origin,name:displayName(config),key:config.keys.cookie});
    service=createService(config,accounts.adapter,{memberDetails:id=>({...accounts.memberDetails(id),canManagePasskeys:passkeys.enabled}),mountRoutes:app=>standaloneRoutes(app,config,accounts,passkeys)});
  }catch(e){accounts?.adapter.close();release();throw e;}
  const cleanup=()=>{accounts.cleanup();passkeys.cleanup();};
  const timer=setInterval(cleanup,60_000);timer.unref();cleanup();
  return {...service,accounts,close(){clearInterval(timer);service.close();release();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const sendCode=smtpMailer(process.env.IDENTITY_SMTP_FILE);
  const config=configuration({...process.env,IDENTITY_CONTRACT:'community-v1'});
  const service=createStandalone(config,{bootstrapEmail:process.env.IDENTITY_BOOTSTRAP_EMAIL,sendCode});
  const server=service.app.listen(config.port,config.host,()=>console.log('Unanym standalone listening on port',config.port));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{service.close();process.exit(0);}));
}
