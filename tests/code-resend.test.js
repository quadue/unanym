import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
import {standaloneAccounts} from '../src/standalone/accounts.js';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';

function fixture(t,{send}={}) {
  const dir=mkdtempSync(join(tmpdir(),'unanym-resend-')),mail=[];let now=Date.now(),accounts;
  const options={dir,key:'fictional-resend-key',now:()=>now,sendCode:async m=>{if(send)await send(m,mail.length);mail.push(m);}};
  accounts=standaloneAccounts(options);
  t.after(()=>{accounts.adapter.close();rmSync(dir,{recursive:true,force:true});});
  return {get accounts(){return accounts;},mail,advance:ms=>{now+=ms;},restart(){accounts.adapter.close();accounts=standaloneAccounts(options);},async restore(){const restored=join(dir,'restored');mkdirSync(restored);await accounts.db.backup(join(restored,'accounts.db'));accounts.adapter.close();options.dir=restored;accounts=standaloneAccounts(options);}};
}
const email='member@example.test',binding='fictional-browser-binding-'.repeat(3),address='203.0.113.10';
const wrong=mail=>{let value='00000000';while(mail.some(m=>m.code===value))value=String(Number(value)+1).padStart(8,'0');return value;};

for(const accepted of [0,1])test(`explicit resend delivers another code; code ${accepted===0?'from the first email works after restart':'from the resent email works after restore'} and consumes the whole request`,async t=>{
  const f=fixture(t),id=await f.accounts.requestCode(email,binding,address);
  const expires=f.accounts.db.prepare('SELECT expires FROM challenges WHERE id=?').get(id).expires;
  await assert.rejects(f.accounts.resendCode(id,binding,address),/wait/);assert.equal(f.mail.length,1);
  f.advance(61_000);
  await assert.rejects(f.accounts.resendCode(id,'another-browser-'.repeat(4),address),/unavailable/);
  assert.equal(f.mail.length,1);
  assert.equal(await f.accounts.resendCode(id,binding,address),id);assert.equal(f.mail.length,2);
  assert.notEqual(f.mail[0].code,f.mail[1].code);
  for(const m of f.mail)assert.equal(m.expiresAt,expires,'mail refers to the unchanged expiry');
  assert.equal(f.accounts.db.prepare('SELECT expires FROM challenges WHERE id=?').get(id).expires,expires);
  assert.equal(f.accounts.db.prepare('SELECT count(*) n FROM accounts').get().n,0);
  const hashes=f.accounts.db.prepare('SELECT digest FROM challenges UNION ALL SELECT digest FROM challenge_resends').all();
  assert(hashes.every(r=>/^[a-f0-9]{64}$/.test(r.digest)&&!f.mail.some(m=>r.digest===m.code)));
  if(accepted===0)f.restart();else await f.restore();
  assert(f.accounts.verifyCode(id,f.mail[accepted].code,binding).account);
  assert.throws(()=>f.accounts.verifyCode(id,f.mail[1-accepted].code,binding),/unavailable/);
  await assert.rejects(f.accounts.resendCode(id,binding,address),/unavailable/);
});

test('adding resend storage preserves a request issued by the preceding schema',async t=>{
  const f=fixture(t),id=await f.accounts.requestCode(email,binding,address);
  f.accounts.db.exec('DROP TABLE challenge_resends');f.restart();f.advance(61_000);
  await f.accounts.resendCode(id,binding,address);assert.equal(f.mail.length,2);
  assert(f.accounts.verifyCode(id,f.mail[0].code,binding).account);
});

test('account confirmation cannot resend another account’s request',async t=>{
  const f=fixture(t),id=await f.accounts.requestCode(email,binding,address);f.advance(61_000);
  await assert.rejects(f.accounts.resendCode(id,binding,address,'unrelated-account'),/unavailable/);
  assert.equal(f.mail.length,1);assert(f.accounts.verifyCode(id,f.mail[0].code,binding).account);
});

test('resend has its own two-send cap and shares the six-per-recipient mail cap',async t=>{
  const f=fixture(t),id=await f.accounts.requestCode(email,binding,address);
  for(let i=0;i<2;i++){f.advance(61_000);await f.accounts.resendCode(id,binding,address);}
  f.advance(61_000);await assert.rejects(f.accounts.resendCode(id,binding,address),/wait/);assert.equal(f.mail.length,3);
  for(let i=0;i<3;i++){
    await f.accounts.requestCode(email,('other-browser-'+i).repeat(4),address);f.advance(61_000);
  }
  await assert.rejects(f.accounts.requestCode(email,'last-browser-'.repeat(4),address),/wait/);
  assert.equal(f.mail.length,6);assert(f.accounts.verifyCode(id,f.mail[0].code,binding).account);
});

test('sending again never resets the five-guess budget',async t=>{
  const f=fixture(t),id=await f.accounts.requestCode(email,binding,address);
  for(let i=0;i<3;i++)assert.throws(()=>f.accounts.verifyCode(id,wrong(f.mail),binding),/match/);
  f.advance(61_000);await f.accounts.resendCode(id,binding,address);
  assert.equal(f.accounts.db.prepare('SELECT attempts FROM challenges WHERE id=?').get(id).attempts,3);
  for(let i=0;i<2;i++)assert.throws(()=>f.accounts.verifyCode(id,wrong(f.mail),binding),/match/);
  for(const m of f.mail)assert.throws(()=>f.accounts.verifyCode(id,m.code,binding),/unavailable/);
  f.advance(61_000);await assert.rejects(f.accounts.resendCode(id,binding,address),/unavailable/);
});

test('failed delivery preserves the existing code and does not leave another valid digest',async t=>{
  const f=fixture(t,{send:async(_mail,count)=>{if(count)throw Error('Fictional mail outage');}});
  const id=await f.accounts.requestCode(email,binding,address);f.advance(61_000);
  await assert.rejects(f.accounts.resendCode(id,binding,address),/could not send/);
  assert.equal(f.accounts.db.prepare('SELECT count(*) n FROM challenge_resends').get().n,0);
  assert(f.accounts.verifyCode(id,f.mail[0].code,binding).account);
});

test('expired requests cannot resend; cleanup removes their extra digests',async t=>{
  const f=fixture(t),id=await f.accounts.requestCode(email,binding,address);
  f.advance(61_000);await f.accounts.resendCode(id,binding,address);f.advance(600_000);
  await assert.rejects(f.accounts.resendCode(id,binding,address),/unavailable/);
  f.accounts.cleanup();assert.equal(f.accounts.db.prepare('SELECT count(*) n FROM challenge_resends').get().n,0);
});

test('a no-script sign-in can send again, rejects forged CSRF and still accepts the first email',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-resend-form-')),mail=[],server=createServer();let service,browser;
  t.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));service?.close();rmSync(dir,{recursive:true,force:true});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,clients=join(dir,'clients.json');writeFileSync(clients,'[]');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Fictional test operator',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:join(dir,'identity')});
  service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.push(m)});server.on('request',service.app);
  browser=await chromium.launch();const page=await browser.newPage({javaScriptEnabled:false,viewport:{width:375,height:812}});
  await page.goto(origin+'/identity/login');await page.getByLabel('Email address').fill(email);await page.getByRole('button',{name:'Send code',exact:true}).click();
  const resend=page.locator('form[action="/identity/login/resend"]'),id=await resend.locator('[name=challenge]').inputValue();
  const forged=await page.request.post(origin+'/identity/login/resend',{headers:{Origin:origin},form:{challenge:id,csrf:'0'.repeat(64)}});
  assert.equal(forged.status(),403);assert.equal(mail.length,1);
  // Fast-forward only the fixture's request-limit windows, avoiding a real wait.
  service.accounts.db.prepare('UPDATE limits SET start=start-61000').run();
  await page.getByRole('button',{name:'Send another code',exact:true}).click();assert.equal(mail.length,2);
  await expect(page.getByLabel('Sign-in code')).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByLabel('Sign-in code').fill(mail[0].code);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/identity/account');
  await expect(page.locator('.member-email')).toHaveText(email);
});
