import {writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// Standalone host and offline backup share this lock. Never steal a live process's lock.
export function dataLock(dir) {
  const path=resolve(dir,'standalone.lock'),owner=JSON.stringify({pid:process.pid,nonce:randomUUID()});
  try{writeFileSync(path,owner,{mode:0o600,flag:'wx'});}
  catch(e){
    if(e.code!=='EEXIST')throw e;
    const old=JSON.parse(readFileSync(path,'utf8'));
    if(!Number.isSafeInteger(old.pid)||old.pid<1)throw new Error('Invalid standalone lock; operator inspection required');
    try{process.kill(old.pid,0);throw new Error('Stop the standalone host before backup, restore, or another start');}
    catch(error){if(error.code!=='ESRCH')throw error;}
    throw new Error('Stale standalone lock; verify the old host stopped and remove standalone.lock before restarting');
  }
  return ()=>{if(readFileSync(path,'utf8')!==owner)throw new Error('Standalone lock changed');unlinkSync(path);};
}
