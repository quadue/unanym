import Database from 'better-sqlite3';
import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
import {confirmationLabel} from '../confirmation-contract.js';

const hash=s=>createHash('sha256').update(s).digest('hex');
export function emailAddress(value) {
  if(typeof value!=='string')throw new Error('Enter an email address.');
  const email=value.trim().toLowerCase();
  if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email))throw new Error('Enter an email address.');
  return email;
}
export function accountCookie(req,name='community_account') {
  const values=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  return values.length===1?values[0].slice(name.length+1):'';
}

export function standaloneAccounts({dir,key,bootstrapEmail,sendCode,cookieName='community_account',now=()=>Date.now()}) {
  const db=new Database(resolve(dir,'accounts.db'));
  db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,verified INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS operators(account TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY,account TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,binding TEXT NOT NULL,digest TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,start INTEGER NOT NULL,count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS organisations(id TEXT PRIMARY KEY,name TEXT NOT NULL,authority_note TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS administrators(organisation TEXT NOT NULL,account TEXT NOT NULL,PRIMARY KEY(organisation,account));
    CREATE TABLE IF NOT EXISTS memberships(id TEXT PRIMARY KEY,organisation TEXT NOT NULL,account TEXT NOT NULL,status TEXT NOT NULL,approved_at TEXT NOT NULL,valid_until TEXT,UNIQUE(organisation,account));
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,organisation TEXT,target TEXT,detail TEXT);
    CREATE TABLE IF NOT EXISTS introductions(membership TEXT PRIMARY KEY,actor TEXT NOT NULL,confirmed_at TEXT NOT NULL,revoked_at TEXT);
  `);
  const bootstrap=bootstrapEmail?emailAddress(bootstrapEmail):null;
  const hmac=value=>createHmac('sha256',key).update(value).digest('hex');
  const timestamp=()=>new Date(now()).toISOString();
  const audit=(actor,action,organisation,target,detail=null)=>db.prepare('INSERT INTO audit(at,actor,action,organisation,target,detail) VALUES(?,?,?,?,?,?)').run(timestamp(),actor,action,organisation,target,detail);
  const ensureAccount=email=>{
    let row=db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
    if(!row){row={id:randomUUID(),email};db.prepare('INSERT INTO accounts(id,email,created) VALUES(?,?,?)').run(row.id,email,now());}
    return row;
  };
  function rate(bucket,max,window) {
    const id=hmac(bucket),at=now(),row=db.prepare('SELECT * FROM limits WHERE bucket=?').get(id);
    if(!row||row.start+window<=at){db.prepare('INSERT OR REPLACE INTO limits VALUES(?,?,1)').run(id,at);return;}
    if(row.count>=max){const e=new Error('Please wait before requesting another code.');e.status=429;throw e;}
    db.prepare('UPDATE limits SET count=count+1 WHERE bucket=?').run(id);
  }
  async function requestCode(email,binding,address) {
    email=emailAddress(email);
    if(typeof binding!=='string'||binding.length<32)throw new Error('Start again from the sign-in page.');
    db.transaction(()=>{rate('ip:'+address,30,3600_000);rate('hour:'+email,6,3600_000);rate('minute:'+email,1,60_000);})();
    const id=randomUUID(),code=String(randomInt(100_000_000)).padStart(8,'0');
    // Reissuing invalidates earlier codes for this email. No code is stored in plaintext.
    db.transaction(()=>{
      db.prepare('UPDATE challenges SET used=1 WHERE email=?').run(email);
      db.prepare('INSERT INTO challenges(id,email,binding,digest,expires) VALUES(?,?,?,?,?)').run(id,email,hash(binding),hmac(id+'\0'+code),now()+600_000);
    })();
    try{await sendCode({email,code});}catch{db.prepare('UPDATE challenges SET used=1 WHERE id=?').run(id);throw new Error('We could not send a code. Please try again later.');}
    return id;
  }
  function verifyCode(id,code,binding) {
    if(typeof id!=='string'||typeof code!=='string'||typeof binding!=='string')throw new Error('Request a new code from the sign-in page.');
    const row=db.prepare('SELECT * FROM challenges WHERE id=?').get(id);
    if(!row||row.used||row.expires<=now()||row.attempts>=5||row.binding!==hash(binding))throw new Error('That code is unavailable. Request a new code.');
    db.prepare('UPDATE challenges SET attempts=attempts+1 WHERE id=?').run(id);
    const actual=hmac(id+'\0'+String(code));
    if(!/^\d{8}$/.test(String(code))||!timingSafeEqual(Buffer.from(row.digest),Buffer.from(actual)))throw new Error('That code did not match. Try again.');
    return db.transaction(()=>{
      const used=db.prepare('UPDATE challenges SET used=1 WHERE id=? AND used=0 AND expires>? AND attempts<=5').run(id,now());
      if(!used.changes)throw new Error('That code is unavailable. Request a new code.');
      const account=ensureAccount(row.email);
      db.prepare('UPDATE accounts SET verified=1 WHERE id=?').run(account.id);
      if(bootstrap===row.email&&!db.prepare('SELECT account FROM operators LIMIT 1').get()){
        db.prepare('INSERT INTO operators VALUES(?)').run(account.id);audit(account.id,'operator_bootstrap',null,account.id);
      }
      const token=randomBytes(32).toString('base64url'),expires=now()+24*3600_000;
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),account.id,expires);
      return {account:account.id,token,expires};
    })();
  }
  const account=id=>db.prepare('SELECT id FROM accounts WHERE id=? AND verified=1').get(id)??null;
  function session(req) {
    const token=accountCookie(req,cookieName);
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    return db.prepare('SELECT a.id FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.digest=? AND s.expires>? AND a.verified=1').get(hash(token),now())??null;
  }
  const isOperator=id=>!!db.prepare('SELECT 1 FROM operators WHERE account=?').get(id);
  const isAdministrator=(id,organisation)=>!!account(id)&&!!db.prepare('SELECT 1 FROM administrators WHERE organisation=? AND account=?').get(organisation,id);
  function requireAdministrator(id,organisation) {if(!isAdministrator(id,organisation)){const e=new Error('Organisation administrator access required.');e.status=403;throw e;}}
  function organisations(id) {
    return db.prepare('SELECT o.* FROM organisations o JOIN administrators a ON a.organisation=o.id WHERE a.account=? ORDER BY o.name').all(id);
  }
  function createOrganisation(actor,{name,adminEmail,authorityNote}) {
    if(!isOperator(actor)){const e=new Error('Operator access required.');e.status=403;throw e;}
    if(typeof name!=='string'||!name.trim()||name.length>120||/[\x00-\x1f\x7f]/.test(name)||typeof authorityNote!=='string'||authorityNote.trim().length<10||authorityNote.length>1000)throw new Error('Enter the organisation name and its authorisation reference.');
    const email=emailAddress(adminEmail);
    return db.transaction(()=>{
      const id='urn:uuid:'+randomUUID(),admin=ensureAccount(email);
      db.prepare('INSERT INTO organisations VALUES(?,?,?)').run(id,name.trim(),authorityNote.trim());
      db.prepare('INSERT INTO administrators VALUES(?,?)').run(id,admin.id);
      audit(actor,'organisation_registered',id,admin.id,authorityNote.trim());return id;
    })();
  }
  function approve(actor,organisation,email,validUntil=null) {
    requireAdministrator(actor,organisation);email=emailAddress(email);
    if(validUntil!==null&&(!Number.isFinite(Date.parse(validUntil))||Date.parse(validUntil)<=now()))throw new Error('Choose a future membership expiry.');
    validUntil=validUntil===null?null:new Date(validUntil).toISOString();
    return db.transaction(()=>{
      const member=ensureAccount(email),old=db.prepare('SELECT id FROM memberships WHERE organisation=? AND account=?').get(organisation,member.id),id=old?.id??randomUUID();
      db.prepare('INSERT OR REPLACE INTO memberships VALUES(?,?,?,?,?,?)').run(id,organisation,member.id,'active',timestamp(),validUntil);
      audit(actor,'membership_approved',organisation,member.id,validUntil);return id;
    })();
  }
  function revoke(actor,organisation,id) {
    requireAdministrator(actor,organisation);
    const member=db.prepare('SELECT * FROM memberships WHERE id=? AND organisation=?').get(id,organisation);
    if(!member)throw new Error('Membership not found.');
    db.transaction(()=>{db.prepare('UPDATE memberships SET status=? WHERE id=?').run('revoked',id);audit(actor,'membership_revoked',organisation,member.account);})();
  }
  function listMembers(actor,organisation) {
    requireAdministrator(actor,organisation);
    return db.prepare('SELECT m.*,a.email FROM memberships m JOIN accounts a ON a.id=m.account WHERE m.organisation=? ORDER BY a.email').all(organisation);
  }
  function memberships(id) {
    if(!account(id))return [];
    return db.prepare("SELECT m.*,o.name FROM memberships m JOIN organisations o ON o.id=m.organisation WHERE m.account=? AND m.status='active' AND (m.valid_until IS NULL OR m.valid_until>?) ORDER BY o.name").all(id,new Date(Math.floor(now()/1000)*1000+1000).toISOString())
      .map(m=>({slug:m.id,name:m.name,organisation:{id:m.organisation,name:m.name},approvedAt:m.approved_at,validUntil:m.valid_until}));
  }
  function cleanup(){db.prepare('DELETE FROM challenges WHERE expires<?').run(now());db.prepare('DELETE FROM sessions WHERE expires<?').run(now());db.prepare('DELETE FROM limits WHERE start<?').run(now()-3600_000);}
  function confirmIntroduction(actor,organisation,id,confirmed){
    requireAdministrator(actor,organisation);
    const member=db.prepare('SELECT * FROM memberships WHERE id=? AND organisation=?').get(id,organisation);
    if(!member)throw new Error('Membership not found.');
    if(confirmed&&(member.account===actor||member.status!=='active'||(member.valid_until&&Date.parse(member.valid_until)<=now())))throw new Error('Choose another current member with an approved membership.');
    db.transaction(()=>{
      if(confirmed)db.prepare('INSERT OR REPLACE INTO introductions VALUES(?,?,?,NULL)').run(id,actor,timestamp());
      else db.prepare('UPDATE introductions SET revoked_at=? WHERE membership=?').run(timestamp(),id);
      audit(actor,confirmed?'introduction_confirmed':'introduction_withdrawn',organisation,member.account);
    })();
  }
  function confirmations(id){
    return memberships(id).flatMap(m=>{
      const row=db.prepare('SELECT * FROM introductions WHERE membership=? AND revoked_at IS NULL').get(m.slug);
      return row&&isAdministrator(row.actor,m.organisation.id)?[{slug:'introduction:'+m.slug,name:confirmationLabel,organisation:m.organisation,confirmedAt:row.confirmed_at,validUntil:m.validUntil}]:[];
    });
  }
  const adapter={session,account,memberships,confirmations,isOpen:()=>true,csrfBinding:req=>accountCookie(req,cookieName),loginURL:path=>'/identity/login?next='+encodeURIComponent(path),close:()=>db.close()};
  return {db,adapter,cookieName,requestCode,verifyCode,isOperator,isAdministrator,organisations,createOrganisation,approve,revoke,listMembers,confirmIntroduction,cleanup,
    logout:req=>db.prepare('DELETE FROM sessions WHERE digest=?').run(hash(accountCookie(req,cookieName)))};
}
