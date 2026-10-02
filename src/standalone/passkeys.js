import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {isIP} from 'node:net';

const hash=value=>createHash('sha256').update(value).digest('hex');
const unavailable=()=>new Error('The passkey could not be verified. Try again or use an email code.');
const transports=new Set(['usb','nfc','ble','internal','hybrid']);

// Keys are scoped to this host. Their private half stays with the member's
// authenticator; website personas and operator-held signing keys are separate.
export function accountPasskeys(accounts,{origin,name,key,now=()=>Date.now()}) {
  const db=accounts.db,rpID=new URL(origin).hostname,enabled=!isIP(rpID.replace(/^\[|\]$/g,''));
  if(new URL(origin).protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(rpID))throw new Error('Passkeys require HTTPS outside loopback.');
  db.exec(`CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY,account TEXT NOT NULL,public_key BLOB NOT NULL,counter INTEGER NOT NULL,name TEXT NOT NULL,transports TEXT NOT NULL,created TEXT NOT NULL,last_used TEXT,device_type TEXT NOT NULL,backed_up INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS passkeys_account ON passkeys(account);
    CREATE TABLE IF NOT EXISTS passkey_users(account TEXT PRIMARY KEY,handle TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS passkey_challenges(id TEXT PRIMARY KEY,challenge TEXT NOT NULL,binding TEXT NOT NULL,account TEXT,kind TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS member_audit ON audit(target,id);`);
  function handle(account,create=false) {
    let row=db.prepare('SELECT handle FROM passkey_users WHERE account=?').get(account);
    if(!row&&create){db.prepare('INSERT OR IGNORE INTO passkey_users VALUES(?,?)').run(account,randomBytes(32).toString('base64url'));row=db.prepare('SELECT handle FROM passkey_users WHERE account=?').get(account);}
    return row?Buffer.from(row.handle,'base64url'):null;
  }
  const list=account=>db.prepare('SELECT id,name,created,last_used FROM passkeys WHERE account=? ORDER BY created,id').all(account);
  function rate(binding,address) {
    const at=now(),bucket=createHmac('sha256',key).update('passkey:'+address).digest('hex'),row=db.prepare('SELECT * FROM limits WHERE bucket=?').get(bucket);
    if(!row||row.start+600_000<=at)db.prepare('INSERT OR REPLACE INTO limits VALUES(?,?,1)').run(bucket,at);
    else {if(row.count>=40){const e=new Error('Please wait before trying another passkey.');e.status=429;throw e;}db.prepare('UPDATE limits SET count=count+1 WHERE bucket=?').run(bucket);}
    if(typeof binding!=='string'||binding.length<32)throw unavailable();
    db.prepare('DELETE FROM passkey_challenges WHERE expires<=?').run(at);
  }
  function save(options,binding,account,kind) {
    const id=randomUUID();
    db.transaction(()=>{
      db.prepare('DELETE FROM passkey_challenges WHERE binding=? AND kind=?').run(hash(binding),kind);
      db.prepare('INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)').run(id,options.challenge,hash(binding),account,kind,now()+300_000);
    })();
    return {challenge:id,options};
  }
  function consume(id,binding,account,kind) {
    if(typeof id!=='string'||typeof binding!=='string')throw unavailable();
    return db.transaction(()=>{
      const row=db.prepare('SELECT * FROM passkey_challenges WHERE id=? AND binding=? AND kind=? AND expires>?').get(id,hash(binding),kind,now());
      if(!row||row.account!==account)throw unavailable();
      db.prepare('DELETE FROM passkey_challenges WHERE id=?').run(id);
      return row;
    })();
  }
  const log=(account,action)=>db.prepare('INSERT INTO audit(at,actor,action,target) VALUES(?,?,?,?)').run(new Date(now()).toISOString(),account,action,account);
  function topLevel(response) {
    try{const data=JSON.parse(Buffer.from(response.response.clientDataJSON,'base64url'));if(data.crossOrigin||data.topOrigin)throw unavailable();}
    catch{throw unavailable();}
  }
  async function registrationOptions(account,binding,address) {
    if(!enabled)throw new Error('Use a domain or localhost to register a passkey.');
    rate(binding,address);
    if(!accounts.adapter.account(account)||list(account).length>=10)throw new Error('This account can hold up to ten passkeys.');
    const keys=db.prepare('SELECT id,transports FROM passkeys WHERE account=?').all(account);
    const options=await generateRegistrationOptions({rpName:name,rpID,userID:handle(account,true),userName:'Your '+name+' account',userDisplayName:'Your '+name+' account',attestationType:'none',supportedAlgorithmIDs:[-7,-257],
      excludeCredentials:keys.map(k=>({id:k.id,transports:JSON.parse(k.transports)})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
    return save(options,binding,account,'registration');
  }
  async function register(account,id,response,binding,label) {
    const challenge=consume(id,binding,account,'registration');
    if(typeof label!=='string'||!label.trim()||label.length>60||/[\x00-\x1f\x7f]/.test(label))throw new Error('Give this passkey a name of up to 60 characters.');
    let result;
    topLevel(response);
    try{result=await verifyRegistrationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});}catch{throw unavailable();}
    if(!result.verified||!result.registrationInfo)throw unavailable();
    const credential=result.registrationInfo.credential;
    return db.transaction(()=>{
      if(!accounts.adapter.account(account)||list(account).length>=10||db.prepare('SELECT 1 FROM passkeys WHERE id=?').get(credential.id))throw unavailable();
      db.prepare('INSERT INTO passkeys VALUES(?,?,?,?,?,?,?,NULL,?,?)').run(credential.id,account,Buffer.from(credential.publicKey),credential.counter,label.trim(),JSON.stringify((Array.isArray(credential.transports)?credential.transports:[]).filter(t=>transports.has(t))),new Date(now()).toISOString(),result.registrationInfo.credentialDeviceType,Number(result.registrationInfo.credentialBackedUp));
      log(account,'passkey_added');
    })();
  }
  async function authenticationOptions(binding,address,account=null) {
    if(!enabled)throw new Error('Use a domain or localhost to sign in with a passkey.');
    rate(binding,address);
    const keys=account===null?[]:db.prepare('SELECT id,transports FROM passkeys WHERE account=?').all(account);
    if(account!==null&&(!accounts.adapter.account(account)||!keys.length))throw unavailable();
    const options=await generateAuthenticationOptions({rpID,allowCredentials:keys.map(k=>({id:k.id,transports:JSON.parse(k.transports)})),userVerification:'required'});
    return save(options,binding,account,account===null?'authentication':'confirmation');
  }
  async function authenticate(id,response,binding,expectedAccount=null) {
    const challenge=consume(id,binding,expectedAccount,expectedAccount===null?'authentication':'confirmation');
    const credential=typeof response?.id==='string'?db.prepare('SELECT * FROM passkeys WHERE id=?').get(response.id):null;
    const userHandle=response?.response?.userHandle;
    const expectedHandle=credential&&handle(credential.account);
    // An authenticator may omit userHandle when allowCredentials selected the
    // credential. The signed-in account still pins its owner. Discoverable
    // anonymous sign-in must provide a matching handle.
    const validHandle=userHandle===null||userHandle===undefined?expectedAccount!==null:
      !!expectedHandle&&typeof userHandle==='string'&&/^[A-Za-z0-9_-]+$/.test(userHandle)&&Buffer.from(userHandle,'base64url').equals(expectedHandle);
    if(!credential||!expectedHandle||(expectedAccount!==null&&credential.account!==expectedAccount)||!accounts.adapter.account(credential.account)||!validHandle)throw unavailable();
    let result;
    topLevel(response);
    try{result=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,
      credential:{id:credential.id,publicKey:new Uint8Array(credential.public_key),counter:credential.counter,transports:JSON.parse(credential.transports)},requireUserVerification:true});}catch{throw unavailable();}
    if(!result.verified||result.authenticationInfo.credentialDeviceType!==credential.device_type)throw unavailable();
    return db.transaction(()=>{
      // A removal or another assertion can finish while signature verification
      // awaits WebCrypto. Do not issue a session using stale credential state.
      const changed=db.prepare('UPDATE passkeys SET counter=?,last_used=?,backed_up=? WHERE id=? AND account=? AND counter=? AND public_key=?').run(result.authenticationInfo.newCounter,new Date(now()).toISOString(),Number(result.authenticationInfo.credentialBackedUp),credential.id,credential.account,credential.counter,credential.public_key);
      if(!changed.changes)throw unavailable();
      return accounts.issueSession(credential.account);
    })();
  }
  function remove(account,id) {
    return db.transaction(()=>{
      const deleted=db.prepare('DELETE FROM passkeys WHERE id=? AND account=?').run(id,account);
      if(!deleted.changes)throw new Error('Passkey not found.');
      db.prepare('DELETE FROM passkey_challenges WHERE account=?').run(account);
      log(account,'passkey_removed');
    })();
  }
  return {enabled,list,registrationOptions,register,authenticationOptions,authenticate,remove,
    cleanup:()=>db.prepare('DELETE FROM passkey_challenges WHERE expires<=?').run(now())};
}
