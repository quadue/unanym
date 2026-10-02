import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';
import {persona,consentReceipt} from '../src/drop.js';

async function fixture() {
  const root=mkdtempSync(join(tmpdir(),'unanym-passkeys-')),dir=join(root,'data'),registry=join(root,'clients.json'),mail=[];
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://localhost:'+server.address().port;
  writeFileSync(registry,JSON.stringify([{client_id:'test-site',name:'Fictional website',homepage:origin,redirect_uris:[origin+'/returned']} ]));
  const settings={IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Test operator',IDENTITY_CLIENTS:registry,IDENTITY_DATA_DIR:dir};
  let config=configuration(settings),service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.push(m)});
  server.on('request',service.app);
  for(const [id,email] of [['member','member@example.test'],['other','other@example.test']])service.accounts.db.prepare('INSERT INTO accounts VALUES(?,?,1,?)').run(id,email,Date.now());
  const browser=await chromium.launch(),context=await browser.newContext(),page=await context.newPage();
  const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  async function login(id='member') {
    const session=service.accounts.issueSession(id);
    await context.addCookies([{name:'community_account',value:session.token,url:origin}]);
    await page.goto(origin+'/identity/security');
  }
  async function restartFromBackup(){
    server.removeListener('request',service.app);service.close();
    const backup=join(root,'snapshot'),restored=join(root,'restored');
    execFileSync(process.execPath,['scripts/backup.js',backup],{env:{...process.env,...settings},stdio:'pipe'});
    execFileSync(process.execPath,['scripts/restore.js',backup,restored],{stdio:'pipe'});
    config=configuration({...settings,IDENTITY_DATA_DIR:restored});
    service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.push(m)});server.on('request',service.app);
  }
  return {root,origin,context,page,cdp,authenticatorId,mail,login,restartFromBackup,get service(){return service;},get config(){return config;},async close(){await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));service.close();rmSync(root,{recursive:true,force:true});}};
}
async function csrf(page,kind,verification=false) {
  return page.locator(`form[data-passkey="${kind}"] [name="${verification?'verify_csrf':'csrf'}"]`).inputValue();
}
async function post(f,path,data,origin=f.origin) {
  return f.context.request.post(f.origin+path,{headers:{Origin:origin},data});
}
// Use the browser's real authenticator ceremony, then serialize its wire response.
// The implementation under test always verifies it with SimpleWebAuthn.
async function assertion(page,options) {
  return page.evaluate(async options=>{
    const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const encode=b=>b?btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''):null;
    const credential=await navigator.credentials.get({publicKey:{...options,challenge:decode(options.challenge),allowCredentials:options.allowCredentials?.map(c=>({...c,id:decode(c.id)}))}}),r=credential.response;
    return {id:credential.id,rawId:encode(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults(),response:{clientDataJSON:encode(r.clientDataJSON),authenticatorData:encode(r.authenticatorData),signature:encode(r.signature),userHandle:encode(r.userHandle)}};
  },options);
}

test('passkeys enroll on an existing account, authenticate with the browser SDK, preserve personas and survive backup/restore',async()=>{
  const f=await fixture();
  try{
    await f.login();const {page}=f;
    const person=await persona(f.service.db,'member','test-site',Buffer.from(f.config.keys.encryption,'base64url'));
    await consentReceipt(f.service.db,person,{name:'Robin',memberships:[],active:true},f.config);
    f.service.db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?)').run('member','test-site','Robin','[]','existing-grant',1,new Date().toISOString());
    const before=f.service.db.prepare('SELECT * FROM personas').all();
    const request=page.waitForRequest(r=>r.url().endsWith('/passkeys/register/verify'));
    await page.getByLabel('Passkey name').fill('My phone');await page.getByRole('button',{name:'Add a passkey'}).click();
    const payload=(await request).postDataJSON();await page.waitForURL(f.origin+'/identity/security');
    assert.match(await page.locator('.member-passkeys').innerText(),/My phone/);
    assert.equal(f.service.accounts.db.prepare('SELECT account FROM passkeys').get().account,'member');
    assert.equal((await post(f,'/identity/passkeys/register/verify',payload)).status(),400,'registration response cannot be replayed');
    assert.equal(f.service.accounts.db.prepare('SELECT count(*) n FROM passkeys').get().n,1);
    await page.goto(f.origin+'/identity/account');await page.locator('.member-recent>summary').click();
    assert.match(await page.locator('.member-activity').innerText(),/Passkey added/);
    await page.getByRole('button',{name:'Mark shown as read'}).click();
    assert.equal(await page.locator('.member-unread-count').count(),0);
    await f.restartFromBackup();
    assert.deepEqual(f.service.db.prepare('SELECT * FROM personas').all(),before);
    assert.equal(f.service.db.prepare('SELECT active,grant_id FROM connections').get().grant_id,'existing-grant');
    assert.equal(f.service.db.prepare('SELECT count(*) n FROM member_update_reads').get().n,2);
    await page.goto(f.origin+'/identity/account');await page.getByRole('button',{name:'Sign out'}).click();
    const response=page.waitForResponse(r=>r.url().endsWith('/passkeys/login/verify'));
    await page.getByRole('button',{name:'Sign in with a passkey'}).click();assert.equal((await response).status(),200);
    await page.waitForURL(f.origin+'/identity/account');
    assert.equal(await page.locator('.member-email').innerText(),'member@example.test');
    assert.deepEqual(f.service.db.prepare('SELECT * FROM personas').all(),before);
    assert.equal(f.service.db.prepare('SELECT name,active,grant_id FROM connections').get().name,'Robin');
    assert.equal(f.service.accounts.db.prepare('SELECT count(*) n FROM accounts').get().n,2);
    await page.getByRole('link',{name:'Passkeys →'}).click();
    assert.match(await page.locator('.member-passkeys').innerText(),/Last used/);
    for(const width of [1280,375,320]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'passkeys page fits '+width);
      if(process.env.UNANYM_CAPTURE_DIR){mkdirSync(process.env.UNANYM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'passkeys-'+width+'.png'),fullPage:true});}
    }
    await page.getByRole('button',{name:'Remove My phone'}).click();
    assert.equal(f.service.accounts.db.prepare('SELECT count(*) n FROM passkeys').get().n,0);
    assert.equal(f.service.accounts.adapter.session({headers:{cookie:(await f.context.cookies()).filter(c=>c.name==='community_account').map(c=>c.name+'='+c.value).join(';')}}).id,'member','removal preserves the current session');
    await page.goto(f.origin+'/identity/account');await page.getByRole('button',{name:'Sign out'}).click();
    const removed=page.waitForResponse(r=>r.url().endsWith('/passkeys/login/verify'));
    await page.getByRole('button',{name:'Sign in with a passkey'}).click();assert.equal((await removed).status(),400,'a removed key cannot sign in');
    assert.match(await page.locator('[role=status]').innerText(),/could not be verified/);
  }finally{await f.close();}
});

test('passkey endpoints enforce origin, CSRF, fresh sign-in, owner binding, expiry and single-use challenges',async()=>{
  const f=await fixture();
  try{
    const {page}=f;await f.login();
    const registered=page.waitForResponse(r=>r.url().endsWith('/passkeys/register/verify'));
    const registrationRequest=page.waitForRequest(r=>r.url().endsWith('/passkeys/register/verify'));
    await page.getByRole('button',{name:'Add a passkey'}).click();const originalRegistration=(await registrationRequest).postDataJSON();assert.equal((await registered).status(),200);await page.waitForURL(f.origin+'/identity/security');
    const credential=f.service.accounts.db.prepare('SELECT id FROM passkeys').get().id;
    let token=await csrf(page,'register');
    assert.equal((await post(f,'/identity/passkeys/register/options',{csrf:token},'https://other.example')).status(),403);
    assert.equal((await post(f,'/identity/passkeys/register/options',{csrf:'forged'})).status(),403);
    assert.equal((await post(f,'/identity/passkeys/register/options',{csrf:'é'.repeat(64)})).status(),403);
    f.service.accounts.db.prepare('UPDATE sessions SET expires=?').run(Date.now()+24*3600_000-660_000);
    assert.equal((await post(f,'/identity/passkeys/register/options',{csrf:token})).status(),403);
    await page.reload();assert.equal(await page.getByRole('button',{name:'Add a passkey'}).count(),0);
    const confirmed=page.waitForResponse(r=>r.url().endsWith('/passkeys/confirm/verify'));
    await page.getByRole('button',{name:'Confirm with a passkey'}).click();assert.equal((await confirmed).status(),200);
    await page.waitForURL(f.origin+'/identity/security');await page.getByRole('button',{name:'Add a passkey'}).waitFor();
    assert.equal(f.mail.length,0,'passkeys confirm the existing account without using email');
    f.service.accounts.db.prepare('UPDATE sessions SET expires=?').run(Date.now()+24*3600_000-660_000);await page.reload();
    const confirmation=await (await post(f,'/identity/passkeys/confirm/options',{csrf:await csrf(page,'confirm')})).json();
    const selectedAssertion=await assertion(page,confirmation.options);selectedAssertion.response.userHandle=null;
    assert.equal((await post(f,'/identity/passkeys/confirm/verify',{csrf:await csrf(page,'confirm',true),challenge:confirmation.challenge,response:selectedAssertion})).status(),200,'a selected credential can confirm its pinned owner without a user handle');
    f.service.accounts.db.prepare('UPDATE sessions SET expires=?').run(Date.now()+24*3600_000-660_000);await page.reload();
    await page.getByRole('button',{name:'Send a confirmation code'}).click();
    await page.getByLabel('Confirmation code').fill(f.mail.at(-1).code);await page.getByRole('button',{name:'Confirm account'}).click();
    await page.waitForURL(f.origin+'/identity/security');assert.equal(await page.getByRole('button',{name:'Add a passkey'}).count(),1);
    // The confirmation ceremony never permits entering a different account email.
    assert.equal(f.service.accounts.adapter.session({headers:{cookie:(await f.context.cookies()).filter(c=>c.name==='community_account').map(c=>c.name+'='+c.value).join(';')}}).id,'member');
    await f.login('other');
    const removalToken=await page.locator('[name=csrf]').first().inputValue();
    const ownRequest=await f.context.request.post(f.origin+'/identity/passkeys/remove',{headers:{Origin:f.origin},form:{csrf:removalToken,credential}});
    assert.equal(ownRequest.status(),403,'wrong-path token is rejected');
    // A correctly scoped removal request still cannot remove another account's key.
    const {createHmac}=await import('node:crypto');
    const otherCookie=(await f.context.cookies()).find(c=>c.name==='community_account').value;
    const ownToken=createHmac('sha256',f.config.keys.cookie).update(otherCookie+'\0/identity/passkeys/remove').digest('hex');
    const otherRemoval=await f.context.request.post(f.origin+'/identity/passkeys/remove',{headers:{Origin:f.origin},form:{csrf:ownToken,credential}});
    assert.equal(otherRemoval.status(),400);assert.equal(f.service.accounts.db.prepare('SELECT account FROM passkeys').get().account,'member');
    const otherOptions=await (await post(f,'/identity/passkeys/register/options',{csrf:await csrf(page,'register')})).json();
    const duplicate=structuredClone(originalRegistration.response),duplicateData=JSON.parse(Buffer.from(duplicate.response.clientDataJSON,'base64url'));
    duplicateData.challenge=otherOptions.options.challenge;duplicate.response.clientDataJSON=Buffer.from(JSON.stringify(duplicateData)).toString('base64url');
    assert.equal((await post(f,'/identity/passkeys/register/verify',{csrf:await csrf(page,'register',true),challenge:otherOptions.challenge,response:duplicate,label:'Another key'})).status(),400,'registration never overwrites another account credential');
    assert.equal(f.service.accounts.db.prepare('SELECT account FROM passkeys').get().account,'member');
    await f.context.clearCookies();await page.goto(f.origin+'/identity/login');
    token=await csrf(page,'login');const verifyToken=await csrf(page,'login',true);
    const options=async()=>{const response=await post(f,'/identity/passkeys/login/options',{csrf:token});assert.equal(response.status(),200);return response.json();};
    const verify=(challenge,response)=>post(f,'/identity/passkeys/login/verify',{csrf:verifyToken,challenge,response,next:'/identity/account'});
    for(const mutation of ['origin','cross-origin','handle','signature','rp','uv','id']){
      const challenge=await options(),response=await assertion(page,challenge.options);
      if(mutation==='origin'||mutation==='cross-origin'){
        const data=JSON.parse(Buffer.from(response.response.clientDataJSON,'base64url'));
        if(mutation==='origin')data.origin='https://other.example';else data.crossOrigin=true;
        response.response.clientDataJSON=Buffer.from(JSON.stringify(data)).toString('base64url');
      }else if(mutation==='handle')response.response.userHandle=Buffer.from('another-account').toString('base64url');
      else if(mutation==='id')response.id='unknown-credential';
      else if(mutation==='signature')response.response.signature=Buffer.from('bad-signature').toString('base64url');
      else {const data=Buffer.from(response.response.authenticatorData,'base64url');if(mutation==='rp')data[0]^=1;else data[32]&=~4;response.response.authenticatorData=data.toString('base64url');}
      assert.equal((await verify(challenge.challenge,response)).status(),400,mutation+' rejected');
      assert.equal((await verify(challenge.challenge,response)).status(),400,'challenge consumed after '+mutation);
    }
    const noVerification=await options();
    await f.cdp.send('WebAuthn.setUserVerified',{authenticatorId:f.authenticatorId,isUserVerified:false});
    const withoutUV=await assertion(page,{...noVerification.options,userVerification:'discouraged'});
    assert.equal(Buffer.from(withoutUV.response.authenticatorData,'base64url')[32]&4,0);
    assert.equal((await verify(noVerification.challenge,withoutUV)).status(),400,'even a valid signature needs authenticator user verification');
    await f.cdp.send('WebAuthn.setUserVerified',{authenticatorId:f.authenticatorId,isUserVerified:true});
    const expired=await options(),expiredResponse=await assertion(page,expired.options);
    f.service.accounts.db.prepare('UPDATE passkey_challenges SET expires=0 WHERE id=?').run(expired.challenge);
    assert.equal((await verify(expired.challenge,expiredResponse)).status(),400);
    const bound=await options(),boundResponse=await assertion(page,bound.options);
    await f.context.clearCookies();await page.goto(f.origin+'/identity/login');token=await csrf(page,'login');
    const changedBinding=await csrf(page,'login',true);
    assert.equal((await post(f,'/identity/passkeys/login/verify',{csrf:changedBinding,challenge:bound.challenge,response:boundResponse})).status(),400);
    const valid=await options(),validResponse=await assertion(page,valid.options);
    const finalToken=await csrf(page,'login',true);
    assert.equal((await post(f,'/identity/passkeys/login/verify',{csrf:finalToken,challenge:valid.challenge,response:validResponse})).status(),200);
    assert.equal((await post(f,'/identity/passkeys/login/verify',{csrf:finalToken,challenge:valid.challenge,response:validResponse})).status(),403,'old CSRF binding is invalid after sign-in');
    await page.goto(f.origin+'/identity/account');assert.equal(await page.locator('.member-email').innerText(),'member@example.test');
  }finally{await f.close();}
});
