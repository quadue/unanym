import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {configuration} from '../src/config.js';
import {openStore,disconnect} from '../src/store.js';
import {validateAccountAdapter} from '../src/accounts.js';
import {fixture} from '../scripts/fixture.js';
import {pactAdapter} from '../src/pact.js';
import {unzipSync} from 'fflate';

test('WordPress registration requires this operator’s origin and never changes active registrations',()=>{
 const dir=mkdtempSync(join(tmpdir(),'identity-registration-')),registry=join(dir,'clients.json'),out=join(dir,'proposal');
 writeFileSync(registry,'[]');
 const args=['scripts/prepare-wordpress-client.js','example-site','Example website','https://community.example/callback',out];
 const env={...process.env,IDENTITY_ORIGIN:'',IDENTITY_CLIENTS:registry,IDENTITY_CLIENT_SECRETS:''};
 try{
  assert.throws(()=>execFileSync(process.execPath,args,{env,stdio:'pipe'}));assert.equal(existsSync(out),false);
  env.IDENTITY_ORIGIN='https://identity.example';execFileSync(process.execPath,args,{env,stdio:'pipe'});
  const proposed=JSON.parse(readFileSync(join(out,'website-setup.json')));
  assert.equal(proposed.issuer,'https://identity.example/identity/oidc');assert.equal(proposed.client_id,'example-site');
  assert.ok(proposed.client_secret.length>=32);assert.equal(statSync(join(out,'website-setup.json')).mode&0o777,0o600);
  assert.equal(readFileSync(registry,'utf8'),'[]');
  assert.throws(()=>execFileSync(process.execPath,args,{env,stdio:'pipe'}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('server-side client requires a separate strong secret; public clients cannot renew',()=>{
 const dir=mkdtempSync(join(tmpdir(),'drop-config-'));
 const client={client_id:'wordpress',name:'WordPress',homepage:'https://wp.example/',redirect_uris:['https://wp.example/callback'],token_endpoint_auth_method:'client_secret_post',allow_refresh:true};
 const env={IDENTITY_DATA_DIR:dir,IDENTITY_CLIENTS:join(dir,'clients.json'),IDENTITY_CLIENT_SECRETS:join(dir,'secrets.json')};
 try{
  writeFileSync(env.IDENTITY_CLIENTS,JSON.stringify([client]));writeFileSync(env.IDENTITY_CLIENT_SECRETS,'{}');
  assert.throws(()=>configuration(env),/Missing strong secret/);
  writeFileSync(env.IDENTITY_CLIENT_SECRETS,JSON.stringify({wordpress:'f'.repeat(43)}));
  assert.equal(configuration(env).clients[0].client_secret,'f'.repeat(43));assert.ok(!readFileSync(env.IDENTITY_CLIENTS,'utf8').includes('f'.repeat(43)));
  writeFileSync(env.IDENTITY_CLIENTS,JSON.stringify([{...client,token_endpoint_auth_method:'none'}]));
  assert.throws(()=>configuration(env),/Only server-side/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('account adapter is explicit and preserves local login return paths and session binding',()=>{
 assert.throws(()=>validateAccountAdapter({}),/requires session/);
 const dir=mkdtempSync(join(tmpdir(),'drop-adapter-')),f=fixture(dir),adapter=pactAdapter({path:f.path,modeFile:f.mode});
 try{
  assert.equal(validateAccountAdapter(adapter),adapter);const raw=f.login('robin');const req={headers:{cookie:'pl_session='+raw}};
  assert.equal(adapter.csrfBinding(req),raw);assert.equal(new URL(adapter.loginURL('/identity/sites'),'https://pact.example').searchParams.get('next'),'/identity/sites');
  writeFileSync(f.mode,'closed');assert.equal(adapter.isOpen(),false);assert.equal(adapter.account('robin'),null);
 }finally{adapter.close();f.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('backup includes confidential-client secrets; restore rejects corruption and overwrites',()=>{
 const dir=mkdtempSync(join(tmpdir(),'drop-backup-')),source=join(dir,'source'),backup=join(dir,'backup'),restored=join(dir,'restored');
 try{
  const config=configuration({IDENTITY_DATA_DIR:source});const db=openStore(join(source,'identity.db'));db.prepare('INSERT INTO connections VALUES (?,?,?,?,?,?,?)').run('synthetic','sample-community','Robin','[]','grant',1,'now');db.close();
  const secrets=join(dir,'secrets.json');writeFileSync(secrets,JSON.stringify({wordpress:'fictional-secret'}));
  const env={...process.env,IDENTITY_DATA_DIR:source,IDENTITY_CLIENT_SECRETS:secrets};
  execFileSync(process.execPath,['scripts/backup.js',backup],{env,stdio:'pipe'});
  execFileSync(process.execPath,['scripts/restore.js',backup,restored],{stdio:'pipe'});
  assert.deepEqual(JSON.parse(readFileSync(join(restored,'keys.json'))),config.keys);
  assert.equal(readFileSync(join(restored,'client-secrets.json'),'utf8'),readFileSync(secrets,'utf8'));
  assert.equal(statSync(join(restored,'keys.json')).mode & 0o777,0o600);
  assert.throws(()=>execFileSync(process.execPath,['scripts/restore.js',backup,restored],{stdio:'pipe'}));
  writeFileSync(join(backup,'keys.json'),'{}');
  assert.throws(()=>execFileSync(process.execPath,['scripts/restore.js',backup,join(dir,'bad')],{stdio:'pipe'}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('reconsent revokes old tokens but preserves only the authenticated current interaction',()=>{
 const db=openStore(':memory:');
 try{
  db.prepare('INSERT INTO connections VALUES (?,?,?,?,?,?,?)').run('member','website','Name','[]','old-grant',1,'now');
  const insert=db.prepare('INSERT INTO oidc VALUES (?,?,?,NULL)');
  insert.run('Grant','old-grant','{}');
  for(const [model,id] of [['AccessToken','access'],['RefreshToken','refresh'],['Interaction','current'],['Interaction','other']])insert.run(model,id,JSON.stringify({grantId:'old-grant',accountId:'member',clientId:'website'}));
  disconnect(db,'member','website',{keepInteraction:'current'});
  assert.deepEqual(db.prepare('SELECT model,id FROM oidc').all(),[{model:'Interaction',id:'current'}]);
  assert.equal(JSON.parse(db.prepare('SELECT payload FROM oidc').get().payload).grantId,undefined);
  disconnect(db,'member','website');assert.equal(db.prepare('SELECT count(*) n FROM oidc').get().n,0);
 }finally{db.close();}
});

test('WordPress staging package includes the exact verifier and current setup contract',()=>{
 const zip=unzipSync(readFileSync('dist/wordpress.zip'));
 for(const file of ['drop-identity.php','memberships.php','member.css'])assert.equal(Buffer.from(zip['drop-identity/'+file]).toString(),readFileSync('integrations/wordpress/drop-identity/'+file,'utf8'));
 assert.match(Buffer.from(zip['drop-identity/CONTRACT.md']).toString(),/Community identity profile 1/);
 assert.match(Buffer.from(zip['drop-identity/SETUP.md']).toString(),/Standalone operator pilot/);
});
