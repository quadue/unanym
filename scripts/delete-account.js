import Database from 'better-sqlite3';
import {appendFileSync,chmodSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dataLock} from '../src/standalone/lock.js';
process.umask(0o077);

// Deletes one account at its holder's request, or replays earlier deletions
// after a restore (docs/account-procedures.md, sections 3 and 4). It holds the
// standalone data lock, so the host must be stopped first.
const usage='Usage: node scripts/delete-account.js --account ID --case REF --list FILE\n       node scripts/delete-account.js --replay FILE --since YYYY-MM-DD';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const replay=option('replay'),list=replay??option('list');
if(!list)throw new Error(usage);
const dir=resolve(process.env.IDENTITY_DATA_DIR??'data');
const release=dataLock(dir);
const accounts=new Database(resolve(dir,'accounts.db'),{fileMustExist:true}),identity=new Database(resolve(dir,'identity.db'),{fileMustExist:true});
const tables=db=>new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
const accountTables=tables(accounts),identityTables=tables(identity);

function check(id,{again=false}={}) {
  const row=accounts.prepare('SELECT email FROM accounts WHERE id=?').get(id);
  if(!row)return null;
  if(accounts.prepare('SELECT 1 FROM operators WHERE account=?').get(id))throw new Error('Operator accounts are not deleted with this script');
  const organisations=accounts.prepare('SELECT organisation FROM administrators WHERE account=?').all(id).map(r=>r.organisation);
  // A live organiser hands over first; a restored copy may predate that handover.
  if(organisations.length&&!again)throw new Error('This account organises a community: hand over the role first');
  return {email:row.email,organisations};
}

function erase(id,email) {
  const removed={};
  const run=(db,known,table,sql,...values)=>{if(known.has(table))removed[table]=(removed[table]??0)+db.prepare(sql).run(...values).changes;};
  // Accounts first: if the second step fails, the identity host's hourly
  // cleanup removes website records whose account no longer exists.
  accounts.transaction(()=>{
    run(accounts,accountTables,'challenge_resends','DELETE FROM challenge_resends WHERE challenge IN (SELECT id FROM challenges WHERE email=?)',email);
    run(accounts,accountTables,'challenges','DELETE FROM challenges WHERE email=?',email);
    run(accounts,accountTables,'introductions','DELETE FROM introductions WHERE membership IN (SELECT id FROM memberships WHERE account=?)',id);
    for(const table of ['sessions','account_activity','passkeys','passkey_users','passkey_challenges','memberships','administrators'])run(accounts,accountTables,table,`DELETE FROM ${table} WHERE account=?`,id);
    // The account's own history goes; organisation records keep their audit.
    run(accounts,accountTables,'audit','DELETE FROM audit WHERE target=? AND organisation IS NULL',id);
    run(accounts,accountTables,'accounts','DELETE FROM accounts WHERE id=?',id);
  })();
  identity.transaction(()=>{
    for(const table of ['personas','connections','receipts','confirmation_choices','member_update_reads'])run(identity,identityTables,table,`DELETE FROM ${table} WHERE account=?`,id);
    run(identity,identityTables,'oidc',"DELETE FROM oidc WHERE json_extract(payload,'$.accountId')=?",id);
  })();
  return removed;
}

try {
  if(replay) {
    const since=option('since');
    if(!/^\d{4}-\d\d-\d\d$/.test(since??''))throw new Error(usage);
    const entries=existsSync(list)?readFileSync(list,'utf8').split('\n').filter(Boolean).map(line=>line.split('\t')):[];
    let deleted=0;
    // Inclusive of the backup's own day: deleting twice is harmless.
    for(const [at,id] of entries) {
      if(at.slice(0,10)<since)continue;
      const found=check(id,{again:true});
      if(!found)continue;
      erase(id,found.email);deleted++;
      if(found.organisations.length)console.log('Deleted again an account that organised',found.organisations.length,'community; redo its handover from the case records:',id);
    }
    console.log(`Deleted again ${deleted} of ${entries.length} listed accounts`);
  } else {
    const id=option('account'),ref=option('case');
    if(!id||!/^[\w:.-]{1,128}$/.test(id)||!ref||!/^[\w.-]{1,64}$/.test(ref))throw new Error(usage);
    const found=check(id);
    if(!found)throw new Error('No account with that ID');
    // Recorded before deleting, so a restore can never miss this deletion.
    appendFileSync(list,`${new Date().toISOString()}\t${id}\t${ref}\n`,{mode:0o600});chmodSync(list,0o600);
    console.log('Deleted',id,JSON.stringify(erase(id,found.email)));
  }
} finally {
  accounts.close();identity.close();release();
}
