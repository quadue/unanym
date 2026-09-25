import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixture} from '../scripts/fixture.js';
import {frrnAccounts,validateSources} from '../src/frrn/accounts.js';
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
  assert.throws(()=>frrnAccounts({path:f.path,modeFile:f.mode,sources:[{...f.sources[0],approvers:[{user_id:'robin',authorisation_reference:'Not an organiser'}]}]}),/current FRRN organiser/);
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
