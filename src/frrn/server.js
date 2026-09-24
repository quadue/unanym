import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {configuration} from '../config.js';
import {createService} from '../service.js';
import {dataLock} from '../standalone/lock.js';
import {frrnAccounts} from './accounts.js';

export function createFrrn(config,{path,modeFile,sources}) {
  if (config.contract!=='community-v1') throw new Error('FRRN v1 host requires community-v1; preserve the legacy issuer separately');
  const release=dataLock(config.dir);let adapter,service;
  try {
    adapter=frrnAccounts({path,modeFile,sources});
    const profilePath=resolve(config.dir,'profile.json');
    const profile={contract:config.contract,issuer:config.issuer,account_source:'frrn',source_instance:adapter.sourceInstance};
    if (existsSync(profilePath)) {
      const old=JSON.parse(readFileSync(profilePath,'utf8'));
      if (Object.keys(profile).some(key=>old[key]!==profile[key])) throw new Error('Preserve issuer, account source and FRRN instance; use an explicit migration');
    } else {
      if (existsSync(resolve(config.dir,'identity.db')) || existsSync(resolve(config.dir,'accounts.db'))) throw new Error('Use a fresh directory for the FRRN v1 host');
      writeFileSync(profilePath,JSON.stringify(profile),{mode:0o600,flag:'wx'});
    }
    service=createService({...config,accountSource:'frrn'},adapter,{mountRoutes:app=>app.get('/identity/account',(_req,res)=>res.redirect('/account'))});
    return {...service,close(){service.close();release();}};
  } catch(error) {adapter?.close();release();throw error;}
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  if(!process.env.FRRN_MEMBERSHIP_SOURCES) throw new Error('FRRN_MEMBERSHIP_SOURCES is required');
  const config=configuration({...process.env,IDENTITY_CONTRACT:'community-v1'});
  const service=createFrrn(config,{path:config.pactDb,modeFile:config.pactMode,sources:JSON.parse(readFileSync(process.env.FRRN_MEMBERSHIP_SOURCES,'utf8'))});
  const server=service.app.listen(config.port,config.host,()=>console.log('Unanym FRRN account host listening on port',config.port));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{service.close();process.exit(0);}));
}
