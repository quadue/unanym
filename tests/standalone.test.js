import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {standaloneAccounts} from '../src/standalone/accounts.js';
import {createStandalone} from '../src/standalone/server.js';
import {configuration} from '../src/config.js';
import {verifyMembership,membershipKey} from '../src/community-contract.js';
import {createLocalJWKSet,jwtVerify} from 'jose';

test('standalone confidential sign-in stays on its own host and returns a chosen name without email',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-independent-login-')),mail=new Map();
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const callback=origin+'/test/callback',client='coco',secret='s'.repeat(48);
  writeFileSync(join(dir,'clients.json'),JSON.stringify([{client_id:client,name:'CoCo',description:'Sign in to CoCo',homepage:origin,redirect_uris:[callback],token_endpoint_auth_method:'client_secret_basic'}]));
  writeFileSync(join(dir,'secrets.json'),JSON.stringify({[client]:secret}));
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Unanym operator',IDENTITY_DISPLAY_NAME:'Unanym',IDENTITY_CLIENTS:join(dir,'clients.json'),IDENTITY_CLIENT_SECRETS:join(dir,'secrets.json'),IDENTITY_DATA_DIR:dir});
  const service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.set(m.email,m.code)});
  service.app.get('/test/callback',(_req,res)=>res.send('Returned to CoCo'));
  server.on('request',service.app);const browser=await chromium.launch();
  try{
    const discovery=await (await fetch(config.issuer+'/.well-known/openid-configuration')).json();
    const jwks=createLocalJWKSet(await (await fetch(discovery.jwks_uri)).json());
    const page=await browser.newPage(),navigations=[];
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
    let first;
    for(let visit=0;visit<2;visit++){
      const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex'),nonce=randomBytes(16).toString('hex');
      const url=new URL(discovery.authorization_endpoint);
      url.search=new URLSearchParams({client_id:client,redirect_uri:callback,response_type:'code',scope:'openid profile',prompt:'consent',claims:JSON.stringify({id_token:{name:{essential:true}}}),state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
      await page.goto(url.href);
      if(visit===0){
        await page.waitForURL('**/identity/login?**');assert.equal(await page.title(),'Sign in · Unanym');
        await page.getByLabel('Email address').fill('member@example.test');await page.getByRole('button',{name:'Send code',exact:true}).click();
        await page.getByLabel('Sign-in code').fill(mail.get('member@example.test'));await page.getByRole('button',{name:'Sign in',exact:true}).click();
      }
      await page.getByLabel('Your name on this website').fill('Robin');
      await page.getByRole('button',{name:'Allow and continue'}).click();await page.waitForURL(callback+'?**');
      const returned=new URL(page.url());assert.equal(returned.searchParams.get('state'),state);
      const response=await fetch(discovery.token_endpoint,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(client+':'+secret).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',redirect_uri:callback,code:returned.searchParams.get('code'),code_verifier:verifier})});
      assert.equal(response.status,200);const tokens=await response.json();
      const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer:config.issuer,audience:client});
      assert.equal(payload.nonce,nonce);assert.equal(payload.name,'Robin');assert.equal(payload.email,undefined);assert.equal(payload.memberships_v1,undefined);
      if(first)assert.equal(payload.sub,first);else first=payload.sub;
    }
    assert(navigations.every(url=>url.startsWith(origin+'/')||url.startsWith(callback)));
    assert.equal(service.accounts.db.prepare('SELECT count(*) n FROM accounts').get().n,1);
  }finally{await browser.close();await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});}
});

test('email codes are browser-bound, one-use, limited, expiring and survive restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-codes-')),mail=[];let now=Date.now();
  const options={dir,key:'test-key',bootstrapEmail:'operator@example.test',sendCode:async m=>mail.push(m),now:()=>now};
  let a=standaloneAccounts(options);const binding='browser-binding-'.repeat(4);
  try{
    const id=await a.requestCode('OPERATOR@example.test',binding,'127.0.0.1');
    assert.throws(()=>a.verifyCode(id,mail.at(-1).code,'another-browser'),/unavailable/);
    assert.equal(a.db.prepare('SELECT attempts FROM challenges WHERE id=?').get(id).attempts,0);
    const login=a.verifyCode(id,mail.at(-1).code,binding);assert.equal(a.isOperator(login.account),true);
    assert.throws(()=>a.verifyCode(id,mail.at(-1).code,binding),/unavailable/);
    await assert.rejects(()=>a.requestCode('operator@example.test',binding,'127.0.0.1'),/wait/);
    assert.equal(a.adapter.session({headers:{cookie:'community_account='+login.token}}).id,login.account);
    assert.equal(a.adapter.session({headers:{cookie:'community_account='+login.token+'; community_account='+login.token}}),null);
    a.adapter.close();a=standaloneAccounts(options);
    assert.equal(a.adapter.session({headers:{cookie:'community_account='+login.token}}).id,login.account);
    now+=61_000;const limited=await a.requestCode('operator@example.test',binding,'127.0.0.1');
    const good=mail.at(-1).code,bad=good==='00000000'?'11111111':'00000000';
    for(let n=0;n<5;n++)assert.throws(()=>a.verifyCode(limited,bad,binding),/match/);
    assert.throws(()=>a.verifyCode(limited,good,binding),/unavailable/);
    now+=61_000;const expired=await a.requestCode('operator@example.test',binding,'127.0.0.1');now+=600_000;
    assert.throws(()=>a.verifyCode(expired,mail.at(-1).code,binding),/unavailable/);
    now+=24*3600_000;assert.equal(a.adapter.session({headers:{cookie:'community_account='+login.token}}),null);
  }finally{a.adapter.close();rmSync(dir,{recursive:true,force:true});}
});

test('organisation admins cannot approve or inspect another organisation; revocation and expiry are current',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-org-'));let now=Date.now(),code;
  const a=standaloneAccounts({dir,key:'test',bootstrapEmail:'operator@example.test',now:()=>now,sendCode:async m=>{code=m.code;}});
  const login=async email=>{const id=await a.requestCode(email,'binding-'.repeat(8),'127.0.0.1');return a.verifyCode(id,code,'binding-'.repeat(8)).account;};
  try{
    const operator=await login('operator@example.test');
    const org=a.createOrganisation(operator,{name:'Local circle',adminEmail:'local@example.test',authorityNote:'Fictional authorisation in isolated test'});
    const other=a.createOrganisation(operator,{name:'National circle',adminEmail:'national@example.test',authorityNote:'Fictional authorisation in isolated test'});
    const local=await login('local@example.test'),national=await login('national@example.test'),member=await login('member@example.test');
    assert.throws(()=>a.approve(operator,org,'member@example.test'),/administrator/);
    assert.throws(()=>a.listMembers(local,other),/administrator/);
    assert.throws(()=>a.approve(member,org,'member@example.test'),/administrator/);
    const id=a.approve(local,org,'member@example.test');a.approve(national,other,'member@example.test',new Date(now+61_000).toISOString());
    assert.equal(a.adapter.memberships(member).length,2);
    assert.throws(()=>a.revoke(local,other,id),/administrator/);
    assert.throws(()=>a.revoke(national,other,id),/not found/);
    a.revoke(local,org,id);assert.deepEqual(a.adapter.memberships(member).map(m=>m.organisation.id),[other]);
    now+=62_000;assert.deepEqual(a.adapter.memberships(member),[]);
    assert.equal(a.db.prepare("SELECT count(*) AS n FROM audit WHERE action='membership_revoked'").get().n,1);
  }finally{a.adapter.close();rmSync(dir,{recursive:true,force:true});}
});

test('standalone browser: email code, admin approval, consent, signed UserInfo, revocation, disconnect and restore',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-flow-')),mail=new Map();
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,callback=origin+'/test/callback',client='test-website';
  const registry=join(dir,'clients.json');writeFileSync(registry,JSON.stringify([{client_id:client,name:'Test community website',description:'Fictional test only',homepage:origin,redirect_uris:[callback]}]));
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Test operator',IDENTITY_DISPLAY_NAME:'Harbour',IDENTITY_CLIENTS:registry,IDENTITY_DATA_DIR:dir});
  let service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.set(m.email,m.code)});
  service.app.get('/test/callback',(_req,res)=>res.send('Returned to website'));
  server.on('request',service.app);
  const browser=await chromium.launch();let stopped=false;
  const login=async(page,email)=>{
    await page.goto(origin+'/identity/login');assert.equal(await page.title(),'Sign in · Harbour');await page.getByLabel('Email address').fill(email);await page.getByRole('button',{name:'Send code',exact:true}).click();
    await page.getByLabel('Sign-in code').fill(mail.get(email));await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/identity/account');
  };
  try{
    const operator=await browser.newPage();await login(operator,'operator@example.test');
    await operator.getByRole('link',{name:'Register an organisation',exact:true}).click();
    await operator.getByLabel('Organisation name').fill('Test circle');await operator.getByLabel('Administrator email').fill('admin@example.test');await operator.getByLabel('Authorisation reference').fill('Fictional appointment for this automated test');await operator.getByRole('button',{name:'Register organisation',exact:true}).click();await operator.waitForURL('**/identity/account');
    const admin=await browser.newPage();await login(admin,'admin@example.test');await admin.getByRole('link',{name:'Test circle',exact:true}).click();
    await admin.getByLabel('Member email').fill('member@example.test');await admin.getByRole('button',{name:'Approve membership',exact:true}).click();await admin.getByText('member@example.test',{exact:true}).waitFor();
    const member=await browser.newPage();await login(member,'member@example.test');assert.equal(await member.getByText('Test circle',{exact:true}).count(),1);
    assert.equal((await (await fetch(origin+'/identity/presentation')).json()).display_name,'Harbour');
    const discovery=await (await fetch(config.issuer+'/.well-known/openid-configuration')).json();assert(discovery.scopes_supported.includes('memberships.v1'));assert(!discovery.scopes_supported.includes('drop_memberships'));
    const verifier=randomBytes(32).toString('base64url');
    const auth=new URL(discovery.authorization_endpoint);auth.search=new URLSearchParams({client_id:client,redirect_uri:callback,response_type:'code',scope:'openid profile identity.v1 memberships.v1',state:'bound-in-test',nonce:'test-nonce',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    await member.goto(auth.href);await member.getByLabel('Your name on this website').fill('Robin');await member.getByRole('checkbox').check();await member.getByRole('button',{name:'Allow and continue'}).click();await member.waitForURL('**/test/callback?**');
    const returned=new URL(member.url());assert.equal(returned.searchParams.get('state'),'bound-in-test');
    const tokenResponse=await fetch(discovery.token_endpoint,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:callback,code:returned.searchParams.get('code'),code_verifier:verifier})});assert.equal(tokenResponse.status,200);const tokens=await tokenResponse.json();
    const info=()=>fetch(discovery.userinfo_endpoint,{headers:{Authorization:'Bearer '+tokens.access_token}});
    const claims=await (await info()).json();assert.equal(claims.name,'Robin');assert.equal(claims.identity_v1.custody,'operator');assert.equal(claims.memberships_v1.statements.length,1);assert.equal(JSON.stringify(claims).includes('member@example.test'),false);assert.equal(claims.drop_identity,undefined);
    const organisation=service.accounts.db.prepare('SELECT id FROM organisations').get().id;
    const publicKey=await membershipKey(config.keys.drop);const proof=await verifyMembership(claims.memberships_v1.statements[0],{signer:config.issuer,organisationId:organisation,subject:claims.sub,audience:client,mode:'operator_attested',publicKey});assert.equal(proof.organisation.name,'Test circle');
    // The actual PHP consumer independently verifies the same operator-signed statement.
    const php=`define('ABSPATH',true);function drop_identity_b64($s){return rtrim(strtr(base64_encode($s),'+/','-_'),'=');}require 'integrations/wordpress/drop-identity/memberships.php';$v=json_decode(stream_get_contents(STDIN),true);echo json_encode(unanym_memberships($v['claim'],$v['sub'],$v['config']));`;
    const runPHP=input=>{
      const options={input:JSON.stringify(input),stdio:['pipe','pipe','pipe']};
      try{return execFileSync('php',['-r',php],options);}
      catch(e){if(e.code!=='ENOENT')throw e;return execFileSync('docker',['run','--rm','-i','--network','none','-v',process.cwd()+':/app:ro','-w','/app','php:8.3-cli@sha256:db99254edaf6de1644b16afa38b150b8b89f05ec4091a631b59a954dd1330058','php','-r',php],options);}
    };
    const input={claim:claims.memberships_v1,sub:claims.sub,config:{issuer:config.issuer,client_id:client,membership_key:publicKey,organisations:[organisation]}};
    assert.equal(JSON.parse(runPHP(input)).length,1);
    input.config.organisations=[];assert.equal(JSON.parse(runPHP(input)).length,0);
    input.config.client_id='wrong-site';assert.throws(()=>runPHP(input));
    const rejected=await admin.request.post(origin+'/identity/organisations/'+encodeURIComponent(organisation)+'/revoke',{form:{membership:'anything'},headers:{Origin:'https://unrelated.example'}});assert.equal(rejected.status(),403);
    await admin.getByRole('button',{name:'Revoke membership'}).click();assert.deepEqual((await (await info()).json()).memberships_v1.statements,[]);
    await member.goto(origin+'/identity/sites');await member.getByRole('button',{name:'Disconnect',exact:true}).click();assert.equal((await info()).status,401);
    const backup=dir+'-backup',restored=dir+'-restored';const env={...process.env,IDENTITY_DATA_DIR:dir,IDENTITY_CLIENTS:registry};
    assert.throws(()=>execFileSync(process.execPath,['scripts/backup.js',backup],{env,stdio:'pipe'}),/Stop the standalone/);
    await new Promise(r=>server.close(r));service.close();stopped=true;
    execFileSync(process.execPath,['scripts/backup.js',backup],{env,stdio:'pipe'});execFileSync(process.execPath,['scripts/restore.js',backup,restored],{stdio:'pipe'});
    assert.equal(JSON.parse(readFileSync(join(backup,'manifest.json'))).format,'community-identity-backup-v1');
    service=createStandalone({...config,dir:restored},{bootstrapEmail:'operator@example.test',sendCode:async()=>{}});
    try{assert.equal(service.accounts.db.prepare("SELECT status FROM memberships").get().status,'revoked');assert.equal(service.db.prepare('SELECT active FROM connections').get().active,0);assert.equal(service.accounts.db.prepare('SELECT count(*) n FROM accounts').get().n,3);}finally{service.close();}
    rmSync(backup,{recursive:true,force:true});rmSync(restored,{recursive:true,force:true});
  }finally{await browser.close();if(!stopped){await new Promise(r=>server.close(r));service.close();}rmSync(dir,{recursive:true,force:true});}
});
