import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';
import {standaloneAccounts} from '../src/standalone/accounts.js';
import {createPublicSite} from '../src/public-site.js';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';

test('trusted proxy clients have separate budgets; an untrusted forwarded hop cannot change the client',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-proxy-')),clients=join(dir,'clients.json');
  writeFileSync(clients,'[]');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_OPERATOR_NAME:'Fictional test operator',IDENTITY_ORIGIN:'https://identity.example.test',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:join(dir,'identity'),IDENTITY_TRUST_PROXY:'127.0.0.1/32,192.0.2.7/32'});
  const service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async()=>{}}),server=service.app.listen(0,'127.0.0.1');
  t.after(async()=>{await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});});
  await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+'/identity/health';
  const get=ip=>fetch(url,{headers:{'X-Forwarded-For':ip+', 192.0.2.7'}});
  assert.equal(service.app.get('trust proxy fn')('198.51.100.20',0),false);
  for(let batch=0;batch<30;batch++){
    const responses=await Promise.all(Array.from({length:20},()=>get('203.0.113.10')));
    for(const response of responses){assert.equal(response.status,200);await response.arrayBuffer();}
  }
  const limited=await get('203.0.113.10');assert.equal(limited.status,429);
  assert.equal((await get('203.0.113.11')).status,200,'another visitor keeps their own budget');
  assert(Number(limited.headers.get('retry-after'))>0);
  assert.equal((await get('198.51.100.20, 203.0.113.10')).status,429,'the last untrusted hop wins over a forged left-hand address');
  assert.equal((await fetch(url)).headers.get('strict-transport-security'),'max-age=31536000');
});

test('proxy trust requires explicit addresses instead of all senders or a hop count',()=>{
  for(const value of ['true','1','0.0.0.0/0','::/0','uniquelocal','192.0.2.1/33','192.0.2.1/32/extra','']){
    assert.throws(()=>configuration({IDENTITY_TRUST_PROXY:value}),/IDENTITY_TRUST_PROXY/);
  }
});

test('public HTTPS installations send HSTS while loopback HTTP development does not',async t=>{
  const servers=[];t.after(async()=>{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));});
  for(const [origin,expected] of [['https://unanym.example.test','max-age=31536000'],['http://127.0.0.1:4386',null]]){
    const server=createPublicSite({origin}).listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/health');
    assert.equal(response.headers.get('strict-transport-security'),expected);
  }
});

test('another browser cannot cancel an issued email code; repeats do not consume the mail budget or extend expiry',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-code-preservation-')),mail=[];let now=Date.now();
  const accounts=standaloneAccounts({dir,key:'fictional-test-key',now:()=>now,sendCode:async m=>mail.push(m)});
  t.after(()=>{accounts.adapter.close();rmSync(dir,{recursive:true,force:true});});
  const email='member@example.test',binding='victim-binding-'.repeat(4);
  const victim=await accounts.requestCode(email,binding,'203.0.113.1'),code=mail[0].code;
  const expires=accounts.db.prepare('SELECT expires FROM challenges WHERE id=?').get(victim).expires;
  for(let n=0;n<5;n++){
    now+=61_000;
    assert.equal(await accounts.requestCode(email,binding,'203.0.113.1'),victim);
  }
  assert.equal(mail.length,1,'same-browser repeats reuse the still-live code');
  assert.equal(accounts.db.prepare('SELECT expires FROM challenges WHERE id=?').get(victim).expires,expires);
  const other=await accounts.requestCode(email,'other-binding-'.repeat(4),'203.0.113.2');
  assert.notEqual(other,victim);assert.equal(mail.length,2);
  assert.throws(()=>accounts.verifyCode(victim,code,'other-binding-'.repeat(4)),/unavailable/);
  const signedIn=accounts.verifyCode(victim,code,binding);assert(signedIn.account);
  assert.throws(()=>accounts.verifyCode(victim,code,binding),/unavailable/);
});

test('recipient throttling cannot prevent completion of an already issued code',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-code-quota-')),mail=[];let now=Date.now();
  const accounts=standaloneAccounts({dir,key:'fictional-test-key',now:()=>now,sendCode:async m=>mail.push(m)});
  t.after(()=>{accounts.adapter.close();rmSync(dir,{recursive:true,force:true});});
  const email='member@example.test',binding='victim-binding-'.repeat(4);
  const victim=await accounts.requestCode(email,binding,'203.0.113.1'),code=mail[0].code;
  for(let n=0;n<5;n++){
    now+=61_000;await accounts.requestCode(email,('other-browser-'+n).repeat(4),'203.0.113.2');
  }
  now+=61_000;
  await assert.rejects(accounts.requestCode(email,'last-browser-'.repeat(4),'203.0.113.2'),/wait/);
  assert.equal(await accounts.requestCode(email,binding,'203.0.113.1'),victim,'the original browser can resume despite the mail cap');
  assert(accounts.verifyCode(victim,code,binding).account);
});

test('an operator notice opens from public and sign-in footers without scripts and is escaped',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-privacy-')),server=createServer();let service,publicServer,browser;
  t.after(async()=>{await browser?.close();if(publicServer)await new Promise(r=>publicServer.close(r));await new Promise(r=>server.close(r));service?.close();rmSync(dir,{recursive:true,force:true});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,clients=join(dir,'clients.json'),notice=join(dir,'privacy.md');
  writeFileSync(clients,'[]');
  writeFileSync(notice,readFileSync(new URL('../docs/privacy-unanym-org.md',import.meta.url),'utf8')+'\n<script>throw new Error("raw markup")</script>');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Fictional test operator',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:join(dir,'identity'),IDENTITY_PRIVACY_NOTICE_FILE:notice});
  service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async()=>{}});server.on('request',service.app);
  publicServer=createPublicSite({origin,accountURL:origin+'/identity/account',privacyNoticeFile:notice}).listen(0,'127.0.0.1');await once(publicServer,'listening');
  const publicOrigin='http://127.0.0.1:'+publicServer.address().port;
  browser=await chromium.launch();const page=await browser.newPage({javaScriptEnabled:false,viewport:{width:375,height:812}});
  for(const entry of [publicOrigin+'/',origin+'/identity/login']){
    await page.goto(entry);await page.getByRole('link',{name:'Privacy',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Who runs this service',exact:true})).toBeVisible();
    await expect(page.locator('main')).toContainText('Mavie.uk');await expect(page.locator('main')).toContainText('hello@mavie.uk');
    assert.equal(new URL(page.url()).pathname,entry.startsWith(publicOrigin)?'/privacy':'/identity/privacy');
    assert.equal(await page.locator('main script').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.equal((await page.request.get(origin+'/identity/privacy')).headers()['strict-transport-security'],undefined,'HTTP development has no HSTS');
  const unconfigured=createPublicSite({origin}).listen(0,'127.0.0.1');await once(unconfigured,'listening');
  try{assert.equal((await fetch('http://127.0.0.1:'+unconfigured.address().port+'/privacy')).status,404,'other operators do not inherit Mavie.uk as controller');}
  finally{await new Promise(r=>unconfigured.close(r));}
});
