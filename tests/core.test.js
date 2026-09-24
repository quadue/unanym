import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {openStore,adapterFor,disconnect} from '../src/store.js';
import {persona,consentReceipt,verifyDropEvent,seal,unseal,membershipReceipt} from '../src/drop.js';
import {newIdentity} from '../vendor/frrn-kernel/identity.js';
import {fixture} from '../scripts/fixture.js';
import {pactAdapter} from '../src/pact.js';

test('Firn adapter reads only the current session and consented memberships; closed mode denies access',()=>{
 const dir=mkdtempSync(join(tmpdir(),'drop-pact-')),f=fixture(dir),p=pactAdapter({path:f.path,modeFile:f.mode});
 try{
  const token=f.login('robin'),req={headers:{cookie:'pl_session='+token}};
  assert.deepEqual(p.session(req),{id:'robin'});assert.equal(p.memberships('robin').length,2);
  assert.equal(p.session({headers:{cookie:'pl_session=forged'}}),null);
  assert.equal(p.session({headers:{cookie:'pl_session='+token+'; pl_session='+token}}),null);
  f.db.prepare("UPDATE memberships SET consented_revision=0 WHERE community_id='private-circle'").run();
  assert.deepEqual(p.memberships('robin').map(m=>m.slug),['lakeside']);
  writeFileSync(f.mode,'closed');assert.equal(p.session(req),null);assert.equal(p.account('robin'),null);
 }finally{p.close();f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('Drop identity is stable per website, separated across websites, encrypted, and tamper evident',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'drop-id-')),path=join(dir,'test.db'),key=randomBytes(32);let db=openStore(path);
 try{
  const a=await persona(db,'robin','sample-community',key),b=await persona(db,'robin','another',key);
  assert.notEqual(a.subject,b.subject);assert.notEqual(a.signer.pub,b.signer.pub);
  assert.ok(await verifyDropEvent(a.identity));
  const event=await consentReceipt(db,a,{name:'Robin',memberships:['lakeside'],active:true});
  assert.ok(await verifyDropEvent(event));assert.equal(await verifyDropEvent({...event,body:{...event.body,sharedCommunities:['private-circle']}}),false);
  db.close();db=openStore(path);
  const restored=await persona(db,'robin','sample-community',key);assert.equal(restored.subject,a.subject);assert.equal(restored.signer.pub,a.signer.pub);
  assert.throws(()=>unseal(a.private_key,randomBytes(32)));
  const withdrawn=await consentReceipt(db,restored,{name:'Robin',memberships:[],active:false});
  assert.ok(withdrawn.seq>event.seq);assert.ok(await verifyDropEvent(withdrawn));
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('persistent OIDC adapter consumes once, expires records, and revokes every token for a grant',async()=>{
 const db=openStore(':memory:'),Adapter=adapterFor(db),codes=new Adapter('AuthorizationCode'),tokens=new Adapter('AccessToken');
 try{
  await codes.upsert('code',{grantId:'g',uid:'u'},60);await codes.consume('code');assert.ok((await codes.find('code')).consumed);
  assert.ok((await codes.findByUid('u')).consumed);
  await tokens.upsert('token',{grantId:'g'},60);await tokens.upsert('other',{grantId:'other'},60);
  await codes.revokeByGrantId('g');assert.equal(await codes.find('code'),undefined);assert.equal(await tokens.find('token'),undefined);assert.ok(await tokens.find('other'));
  await codes.upsert('expired',{},-1);assert.equal(await codes.find('expired'),undefined);
 }finally{db.close();}
});
test('disconnect is account and client scoped and invalidates prior grants',async()=>{
 const db=openStore(':memory:'),Adapter=adapterFor(db),tokens=new Adapter('AccessToken');
 try{
  for(const id of ['robin','sam']){db.prepare('INSERT INTO connections VALUES (?,?,?,?,?,?,?)').run(id,'sample-community',id,'[]',id+'-grant',1,'now');await tokens.upsert(id,{accountId:id,clientId:'sample-community',grantId:id+'-grant'},300);}
  disconnect(db,'robin','sample-community');assert.equal(await tokens.find('robin'),undefined);assert.ok(await tokens.find('sam'));
  assert.equal(db.prepare("SELECT active FROM connections WHERE account='robin'").get().active,0);
 }finally{db.close();}
});
test('membership statement binds its issuer, subject, website, selected memberships and expiry',async()=>{
 const signer=newIdentity(),event=await membershipReceipt(signer,{issuer:'https://pact.example/identity/oidc',subject:'site-subject',client:'sample-community',memberships:[{slug:'lakeside',name:'Lakeside'}]});
 assert.ok(await verifyDropEvent(event));assert.equal(event.body.audience,'sample-community');assert.equal(event.body.subject,'site-subject');
 assert.ok(Date.parse(event.body.validUntil)>Date.now());assert.equal(await verifyDropEvent({...event,body:{...event.body,audience:'another'}}),false);
});
test('vendored Drop code matches the pinned foundation revision',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../vendor/frrn-kernel/provenance.json',import.meta.url)));
 for(const [file,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(new URL('../vendor/frrn-kernel/'+file,import.meta.url))).digest('hex'),hash);
});
