import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture} from '../scripts/fixture.js';
import {frrnAccounts,validateSources} from '../src/frrn/accounts.js';
import {createService} from '../src/service.js';
import {createFrrn} from '../src/frrn/server.js';
import {createStandalone} from '../src/standalone/server.js';
import {configuration} from '../src/config.js';

function sourceFixture(){
 const dir=mkdtempSync(join(tmpdir(),'unanym-frrn-source-')),f=fixture(dir);
 // Test the adapter's published input contract; FRRN owns and tests the view.
 f.db.exec(`ALTER TABLE memberships ADD COLUMN role TEXT DEFAULT 'member';
   CREATE TABLE identity_source_instance(id INTEGER PRIMARY KEY,instance_id TEXT);
   INSERT INTO identity_source_instance VALUES(1,'fixture-instance');
   CREATE TABLE identity_memberships_v1(membership_id TEXT,user_id TEXT,community_id TEXT,display_name TEXT,approved_by TEXT,approved_at TEXT,valid_until TEXT);
   INSERT INTO memberships(user_id,community_id,display_name,status,consented_revision,role) VALUES('sam','lakeside','Organiser','active',1,'steward');`);
 const sources=[{community_id:'lakeside',organisation:{id:'urn:example:lakeside',name:'Lakeside'},approvers:[{user_id:'sam',authorisation_reference:'Fictional administrator appointment'}]}];
 const add=actor=>f.db.prepare('INSERT INTO identity_memberships_v1 VALUES(?,?,?,?,?,?,?)').run('member','robin','lakeside','Robin here',actor,new Date().toISOString(),null);
 return {...f,dir,sources,add,close(){f.db.close();rmSync(dir,{recursive:true,force:true});}};
}

test('FRRN source reads only the declared authorised approval projection, never ordinary membership or resource grants',()=>{
 const f=sourceFixture();const adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources:f.sources});
 try{
  assert.deepEqual(adapter.memberships('robin'),[]);f.add('unrecognised-approver');assert.deepEqual(adapter.memberships('robin'),[]);
  f.add('sam');const [m]=adapter.memberships('robin');assert.equal(m.name,'Lakeside');assert.equal(m.display_name,'Robin here');assert.equal(m.email,undefined);assert.equal(m.profile,undefined);
  assert.equal(adapter.memberships('sam').length,0);
  assert.throws(()=>validateSources([...f.sources,...f.sources]),/duplicate/);
  f.db.prepare('DELETE FROM identity_memberships_v1').run();assert.equal(adapter.memberships('robin').length,0);
  writeFileSync(f.mode,'closed');assert.equal(adapter.account('robin'),null);assert.equal(adapter.memberships('robin').length,0);
 }finally{adapter.close();f.close();}
});

test('fresh FRRN host pins its source instance and cannot turn into a standalone or legacy issuer',()=>{
 const f=sourceFixture(),clients=join(f.dir,'clients.json');writeFileSync(clients,'[]');
 const config=configuration({IDENTITY_ORIGIN:'http://127.0.0.1:4440',IDENTITY_CONTRACT:'community-v1',IDENTITY_OPERATOR_NAME:'Test operator',IDENTITY_DATA_DIR:join(f.dir,'identity'),IDENTITY_CLIENTS:clients});
 const input={path:f.path,modeFile:f.mode,sources:f.sources};
 try{
  let service=createFrrn(config,input);service.close();assert.equal(existsSync(join(config.dir,'accounts.db')),false);
  const profile=JSON.parse(readFileSync(join(config.dir,'profile.json')));assert.equal(profile.account_source,'frrn');assert.equal(profile.source_instance,'fixture-instance');
  assert.throws(()=>createStandalone(config,{bootstrapEmail:'admin@example.test',sendCode:async()=>{}}),/explicit/);
  assert.throws(()=>createFrrn({...config,contract:'legacy-firn'},input),/preserve the legacy/);
  f.db.prepare('UPDATE identity_source_instance SET instance_id=?').run('different-instance');
  assert.throws(()=>createFrrn(config,input),/source/);
  f.db.prepare('UPDATE identity_source_instance SET instance_id=?').run('fixture-instance');
  service=createFrrn(config,input);service.close();
  const sourceFile=join(f.dir,'sources.json'),backup=join(f.dir,'backup'),restored=join(f.dir,'restored');writeFileSync(sourceFile,JSON.stringify(f.sources));
  execFileSync(process.execPath,['scripts/backup.js',backup],{env:{...process.env,IDENTITY_DATA_DIR:config.dir,IDENTITY_CLIENTS:clients,FRRN_MEMBERSHIP_SOURCES:sourceFile},stdio:'pipe'});
  execFileSync(process.execPath,['scripts/restore.js',backup,restored],{stdio:'pipe'});
  assert.deepEqual(JSON.parse(readFileSync(join(restored,'frrn-sources.json'))),f.sources);
  assert.deepEqual(JSON.parse(readFileSync(join(restored,'profile.json'))),profile);
 }finally{f.close();}
});

test('versioned FRRN routes keep the legacy issuer separate and pin the new URL',async()=>{
 const f=sourceFixture(),clients=join(f.dir,'clients.json');writeFileSync(clients,'[]');
 const env={IDENTITY_ORIGIN:'http://127.0.0.1:4440',IDENTITY_BASE_PATH:'/identity/v1',IDENTITY_CONTRACT:'community-v1',IDENTITY_OPERATOR_NAME:'Test operator',IDENTITY_DATA_DIR:join(f.dir,'identity'),IDENTITY_CLIENTS:clients,IDENTITY_WORDPRESS_DOWNLOAD:'1'};
 const config=configuration(env),service=createFrrn(config,{path:f.path,modeFile:f.mode,sources:[]});
 const server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const discovery=await (await fetch(origin+'/identity/v1/oidc/.well-known/openid-configuration',{headers:{'x-forwarded-host':'127.0.0.1:4440'}})).json();
  assert.equal(discovery.issuer,env.IDENTITY_ORIGIN+'/identity/v1/oidc');
  for(const key of ['authorization_endpoint','token_endpoint','userinfo_endpoint','jwks_uri'])assert.ok(discovery[key].startsWith(discovery.issuer+'/'),key+': '+discovery[key]);
  assert.equal((await fetch(origin+'/identity/oidc/.well-known/openid-configuration')).status,404);
  const redirect=await fetch(origin+'/identity/v1/sites',{redirect:'manual'});
  assert.equal(redirect.headers.get('location'),'/?next=%2Fidentity%2Fv1%2Fsites');
  const homePath='/identity/v1/account';
  assert.equal((await fetch(origin+homePath,{redirect:'manual'})).headers.get('location'),'/?next=%2Fidentity%2Fv1%2Faccount');
  const homeResponse=await fetch(origin+homePath,{headers:{Cookie:'pl_session='+f.login('robin')}}),home=await homeResponse.text();
  assert.equal(homeResponse.status,200);assert.equal(homeResponse.headers.get('cache-control'),'no-store');
  assert.match(home,/<title>Your Unanym · Unanym<\/title>/);assert.match(home,/<h1>One you\.<br>No places yet\.<\/h1>/);assert.match(home,/Nothing to do yet\./);assert.doesNotMatch(home,/removed after 12 months/,'Firn accounts are not removed by this host');assert.match(home,/Manage your FRRN account/);
  assert.match(home,/<dt>Account &amp; approvals<\/dt><dd>FRRN<\/dd>/);assert.match(home,/href="\/account">FRRN account/);
  assert.doesNotMatch(home,/robin@example.invalid|Sign out/);
  assert.equal(existsSync(join(config.dir,'accounts.db')),false,'the member home creates no second account store');
  const html=await (await fetch(origin+'/identity/v1/developers')).text();
  assert.match(html,/\/identity\/v1\/assets\/front.css/);assert.match(html,/\/identity\/v1\/docs\/frrn-host/);assert.match(html,/\/identity\/v1\/docs\/contract/);
  for(const path of ['/identity/v1/docs/frrn-host','/identity/v1/docs/contract','/identity/v1/docs/organisers'])assert.equal((await fetch(origin+path)).status,200);
  assert.match(await (await fetch(origin+'/identity/v1/docs/organisers')).text(),/Manage community → Membership approvals/,'a FRRN-backed host describes FRRN organiser screens');
  assert.equal((await fetch(origin+'/identity/v1/wordpress.zip')).status,200);
  assert.equal((await fetch(origin+'/identity/v1/starter.zip')).status,409);
  assert.throws(()=>configuration({...env,IDENTITY_BASE_PATH:'/identity'}),/original contract and issuer/);
  assert.throws(()=>configuration({...env,IDENTITY_CONTRACT:'legacy-firn'}),/legacy issuer path/);
  assert.throws(()=>configuration({...env,IDENTITY_BASE_PATH:'/identity/../other'}),/Unsupported/);
 }finally{await new Promise(r=>server.close(r));service.close();f.close();}
});

test('FRRN confirmations require explicit source opt-in and both authorised decisions',()=>{
 const f=sourceFixture();let adapter;
 try{
  f.db.exec('CREATE TABLE identity_confirmations_v1(user_id TEXT,community_id TEXT,approved_by TEXT,confirmed_by TEXT,confirmed_at TEXT,valid_until TEXT)');
  f.db.prepare('INSERT INTO identity_confirmations_v1 VALUES(?,?,?,?,?,NULL)').run('robin','lakeside','sam','sam',new Date().toISOString());
  adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources:f.sources});assert.deepEqual(adapter.confirmations('robin'),[]);adapter.close();
  const sources=[{...f.sources[0],confirmation_kinds:['community_introduction']}];
  adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources});assert.equal(adapter.confirmations('robin').length,1);assert.deepEqual(adapter.confirmations('sam'),[]);
  f.db.prepare("UPDATE identity_confirmations_v1 SET confirmed_by='outsider'").run();assert.deepEqual(adapter.confirmations('robin'),[]);
  f.db.prepare("UPDATE identity_confirmations_v1 SET confirmed_by='sam',approved_by='outsider'").run();assert.deepEqual(adapter.confirmations('robin'),[]);
  f.db.prepare("UPDATE identity_confirmations_v1 SET approved_by='sam',valid_until='2000-01-01T00:00:00Z'").run();assert.deepEqual(adapter.confirmations('robin'),[]);
  assert.throws(()=>validateSources([{...f.sources[0],confirmation_kinds:['qualified_counsellor']}]),/Only explicit/);
 }finally{adapter?.close();f.close();}
});

const SECRET='fictional-secret-not-real-0123456789abcdef';
const SCOPE='openid profile identity.v1 memberships.v1 offline_access';
const SLUG='frrn:lakeside:urn:example:lakeside';
function hostConfig(f){
 const clients=join(f.dir,'clients.json'),secrets=join(f.dir,'client-secrets.json');
 writeFileSync(clients,JSON.stringify([{client_id:'site',name:'Fictional site',homepage:'https://site.example/',redirect_uris:['https://site.example/cb'],token_endpoint_auth_method:'client_secret_post',allow_refresh:true}]));
 writeFileSync(secrets,JSON.stringify({site:SECRET}));
 return configuration({IDENTITY_ORIGIN:'http://127.0.0.1:4440',IDENTITY_BASE_PATH:'/identity/v1',IDENTITY_CONTRACT:'community-v1',IDENTITY_OPERATOR_NAME:'Test operator',IDENTITY_DATA_DIR:join(f.dir,'identity'),IDENTITY_CLIENTS:clients,IDENTITY_CLIENT_SECRETS:secrets});
}
/** A website already connected to the member, as a real receiver sees the host. */
async function connectedSite(service,account='robin'){
 const server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+server.address().port,{provider}=service;
 const proxied={'x-forwarded-host':'127.0.0.1:4440','x-forwarded-proto':'http'};
 service.db.prepare('INSERT OR REPLACE INTO connections VALUES (?,?,?,?,?,?,?)').run(account,'site','Robin',JSON.stringify([SLUG]),'g',1,new Date().toISOString());
 const client=await provider.Client.find('site'),grant=new provider.Grant({accountId:account,clientId:'site'});
 grant.addOIDCScope(SCOPE);const grantId=await grant.save();
 const session={accountId:account,client,grantId,scope:SCOPE,gty:'authorization_code'};
 const token=()=>new provider.AccessToken(session).save();
 const refreshToken=await new provider.RefreshToken({...session,sessionUid:'test-session'}).save();
 return {
  me:async()=>{const r=await fetch(origin+'/identity/v1/oidc/me',{headers:{Authorization:'Bearer '+await token(),...proxied}});return {status:r.status,body:await r.json().catch(()=>({})),challenge:r.headers.get('www-authenticate')};},
  refresh:async()=>{const r=await fetch(origin+'/identity/v1/oidc/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...proxied},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,client_id:'site',client_secret:SECRET})});return {status:r.status,body:await r.json().catch(()=>({}))};},
  connected:()=>service.db.prepare("SELECT active FROM connections WHERE account=? AND client='site'").get(account)?.active,
  close:()=>new Promise(r=>server.close(r))
 };
}

test('a closed source is unavailable, not a deleted account, and ends nothing',async()=>{
 const f=sourceFixture();f.add('sam');
 const service=createFrrn(hostConfig(f),{path:f.path,modeFile:f.mode,sources:f.sources}),site=await connectedSite(service);
 try{
  const open=await site.me();assert.equal(open.status,200);assert.equal(open.body.memberships_v1.statements.length,1);
  for(const close of [()=>writeFileSync(f.mode,'closed'),()=>unlinkSync(f.mode)]){
   close();
   const me=await site.me();
   assert.equal(me.status,503,'a website must be able to tell this from an ended connection');
   assert.equal(me.body.error,'temporarily_unavailable');assert.equal(me.body.memberships_v1,undefined);
   assert.doesNotMatch(me.challenge??'',/invalid_token/);
   const refresh=await site.refresh();assert.equal(refresh.status,503);assert.equal(refresh.body.error,'temporarily_unavailable');
   assert.equal(site.connected(),1);
  }
  writeFileSync(f.mode,'live');
  const back=await site.me();assert.equal(back.status,200);assert.equal(back.body.memberships_v1.statements.length,1);
  assert.equal((await site.refresh()).status,200,'the refresh token survives a closure');
  // The distinction must not cost the real signal.
  f.db.prepare("DELETE FROM users WHERE id='robin'").run();
  const gone=await site.me();assert.equal(gone.status,401);assert.match(gone.challenge,/invalid_token/);
 }finally{await site.close();service.close();f.close();}
});

test('a source closing between the account check and the membership read stays unavailable',async()=>{
 const f=sourceFixture();f.add('sam');
 const adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources:f.sources}),read=adapter.memberships;
 const service=createService({...hostConfig(f),accountSource:'frrn'},{...adapter,memberships:id=>{writeFileSync(f.mode,'closed');return read(id);}});
 const site=await connectedSite(service);
 try{
  const me=await site.me();assert.equal(me.status,503);assert.equal(me.body.memberships_v1,undefined,'an empty list here would read as a withdrawn membership');
 }finally{await site.close();service.close();f.close();}
});

test('a read error stays unavailable and does not end the connection',async()=>{
 const f=sourceFixture();f.add('sam');
 const service=createFrrn(hostConfig(f),{path:f.path,modeFile:f.mode,sources:f.sources}),site=await connectedSite(service);
 try{
  f.db.exec('DROP TABLE identity_memberships_v1');
  assert.equal((await site.me()).status>=500,true);assert.equal(site.connected(),1);
 }finally{await site.close();service.close();f.close();}
});

test('an organiser stepping down neither stops the host nor ends the approvals they made',()=>{
 const f=sourceFixture();f.add('sam');
 const stepDown=()=>f.db.prepare("UPDATE memberships SET role='member' WHERE user_id='sam' AND community_id='lakeside'").run();
 let adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources:f.sources});
 try{
  assert.deepEqual(adapter.sourceProblems,[]);assert.equal(adapter.memberships('robin').length,1);
  stepDown();assert.equal(adapter.memberships('robin').length,1,'the running host answers yes');
  adapter.close();adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources:f.sources});
  assert.equal(adapter.memberships('robin').length,1,'a restart must not change the answer');
  assert.deepEqual(adapter.sourceProblems.map(p=>[p.organisation,p.kind]),[['urn:example:lakeside','former-organiser']]);
  assert.equal(JSON.stringify(adapter.sourceProblems).includes('sam'),false,'problems go to the log, so they name no person');
 }finally{adapter.close();f.close();}
 // Removing the approver stays the deliberate way to stop sharing what they approved (frrn-host.md).
 const g=sourceFixture();g.add('sam');const sources=[{...g.sources[0],approvers:[{user_id:'someone-else',authorisation_reference:'New appointment'}]}];
 const next=frrnAccounts({path:g.path,modeFile:g.mode,sources});
 try{assert.equal(next.memberships('robin').length,0);}finally{next.close();g.close();}
});

test('a broken binding touches only its own space',()=>{
 const f=sourceFixture();f.add('sam');
 const sources=[{community_id:'gone',organisation:{id:'urn:example:gone',name:'Gone'},approvers:[{user_id:'sam',authorisation_reference:'Fictional'}]},...f.sources];
 const adapter=frrnAccounts({path:f.path,modeFile:f.mode,sources});
 try{
  assert.equal(adapter.memberships('robin').length,1);
  assert.deepEqual(adapter.sourceProblems.map(p=>[p.organisation,p.kind]),[['urn:example:gone','unknown-community']]);
 }finally{adapter.close();f.close();}
});

test('the setup check refuses a binding the host would only warn about',()=>{
 const f=sourceFixture(),file=join(f.dir,'sources.json');
 const check=()=>{try{return {code:0,out:execFileSync(process.execPath,['scripts/check-frrn-sources.js',file,f.path],{stdio:'pipe'}).toString()};}catch(e){return {code:e.status,out:e.stderr.toString()};}};
 try{
  writeFileSync(file,JSON.stringify(f.sources));assert.equal(check().code,0);
  writeFileSync(file,JSON.stringify([{...f.sources[0],approvers:[{user_id:'robin',authorisation_reference:'Not an organiser'}]}]));
  const refused=check();assert.equal(refused.code,1);assert.match(refused.out,/current FRRN organiser/);
  writeFileSync(file,'[{}]');assert.equal(check().code,1);
 }finally{f.close();}
});
