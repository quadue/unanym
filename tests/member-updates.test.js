import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {standaloneAccounts} from '../src/standalone/accounts.js';
import {openStore} from '../src/store.js';
import {memberUpdates,markUpdatesRead} from '../src/member-home.js';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';

test('private updates acknowledge only their own snapshot and persist; expiry reminders change on renewal and expiry',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-updates-'));let now=Date.now();
  const options={dir,key:'test-key',now:()=>now,sendCode:async()=>{}},a=standaloneAccounts(options);let db=openStore(join(dir,'identity.db'));
  try{
    for(const id of ['admin','member','other'])a.db.prepare('INSERT INTO accounts VALUES(?,?,1,?)').run(id,id+'@example.test',now);
    a.db.prepare('INSERT INTO organisations VALUES(?,?,?)').run('test-circle','Test circle','Fictional authorisation');
    a.db.prepare('INSERT INTO administrators VALUES(?,?)').run('test-circle','admin');
    const until=new Date(now+3*24*3600_000).toISOString();
    a.approve('admin','test-circle','member@example.test',until);a.approve('admin','test-circle','other@example.test',until);
    const get=id=>memberUpdates(db,id,[],a.memberDetails(id));
    let updates=get('member');assert.equal(updates.length,2);assert.equal(updates.filter(u=>u.unread).length,2);
    assert.match(updates.find(u=>u.id.startsWith('expiry:')).label,/Membership expires/);
    const own=updates.map(u=>u.id),other=get('other').map(u=>u.id);
    assert.throws(()=>markUpdatesRead(db,'member',[own[0],other[0]],updates),/Return/);
    assert.equal(db.prepare('SELECT count(*) n FROM member_update_reads').get().n,0,'rejection is atomic');
    now+=1000;a.confirmIntroduction('admin','test-circle',a.db.prepare('SELECT id FROM memberships WHERE account=?').get('member').id,true);
    markUpdatesRead(db,'member',own,get('member'));
    assert.equal(get('member').filter(u=>u.unread).length,1,'new unseen confirmation is not acknowledged');
    assert.equal(get('other').filter(u=>u.unread).length,2,'another member is unaffected');
    db.close();db=openStore(join(dir,'identity.db'));assert.equal(get('member').filter(u=>u.unread).length,1,'read state survives restart');
    markUpdatesRead(db,'member',get('member').map(u=>u.id),get('member'));
    now=Date.parse(until)+1000;updates=get('member');
    assert.equal(updates.filter(u=>u.unread).length,1);assert.equal(updates.find(u=>u.unread).label,'Membership expired');
    assert.equal(a.adapter.memberships('member').length,0,'expired approval no longer supplies a current membership');
    const expiredID=updates.find(u=>u.unread).id;
    now+=1000;a.approve('admin','test-circle','member@example.test',new Date(now+2*24*3600_000).toISOString());
    updates=get('member');assert(!updates.some(u=>u.id===expiredID));assert.equal(updates.filter(u=>u.unread).length,2,'renewal generates a new approval and reminder');
    a.revoke('admin','test-circle',a.db.prepare('SELECT id FROM memberships WHERE account=?').get('member').id);
    assert(!get('member').some(u=>u.id.startsWith('expiry:')),'withdrawal removes obsolete expiry reminders');
    assert.equal(JSON.stringify(get('member')).includes('other@example.test'),false);
  }finally{db.close();a.adapter.close();rmSync(dir,{recursive:true,force:true});}
});

test('updates work without JavaScript, cap lists, paginate, protect acknowledgements and leave new arrivals unread',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-updates-browser-')),registry=join(dir,'clients.json');writeFileSync(registry,'[]');
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Test operator',IDENTITY_CLIENTS:registry,IDENTITY_DATA_DIR:dir});
  const service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async()=>{}});server.on('request',service.app);
  const a=service.accounts,db=service.db;
  for(const id of ['member','other'])a.db.prepare('INSERT INTO accounts VALUES(?,?,1,?)').run(id,id+'@example.test',Date.now());
  a.db.prepare('INSERT INTO organisations VALUES(?,?,?)').run('test-circle','Test circle','Fictional authorisation');
  const insert=(id,at=Date.now())=>a.db.prepare('INSERT INTO audit(at,actor,action,organisation,target,detail) VALUES(?,?,?,?,?,?)').run(new Date(at).toISOString(),'private-admin','membership_approved','test-circle',id,'Never show this private administrative detail');
  for(let i=0;i<135;i++)insert('member',Date.now()-100000+i*100);
  const other=insert('other');
  const browser=await chromium.launch(),context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
  try{
    const session=a.issueSession('member');await context.addCookies([{name:'community_account',value:session.token,url:origin}]);
    await page.goto(origin+'/identity/account');assert.equal(await page.locator('.member-activity li').count(),8);assert.equal(await page.locator('.member-unread-count').innerText(),'135 unread');
    await page.locator('.member-recent>summary').click();
    const form=page.locator('form[action="/identity/updates/read"]'),csrf=await form.locator('[name=csrf]').inputValue();
    assert.equal((await context.request.post(origin+'/identity/updates/read',{headers:{Origin:'https://elsewhere.example'},form:{csrf,updates:'approval:1'}})).status(),403);
    assert.equal((await context.request.post(origin+'/identity/updates/read',{headers:{Origin:origin},form:{csrf:'forged',updates:'approval:1'}})).status(),403);
    assert.equal((await context.request.post(origin+'/identity/updates/read',{headers:{Origin:origin},form:{csrf:'é'.repeat(64),updates:'approval:1'}})).status(),403);
    assert.equal((await context.request.post(origin+'/identity/updates/read',{headers:{Origin:origin},form:{csrf,updates:'approval:'+other.lastInsertRowid}})).status(),400);
    assert.equal(db.prepare('SELECT count(*) n FROM member_update_reads').get().n,0);
    insert('member');
    await page.getByRole('button',{name:'Mark shown as read'}).click();
    assert.equal(await page.locator('.member-unread-count').innerText(),'128 unread','acknowledges only eight previously shown notices');
    await page.locator('.member-recent>summary').click();await page.getByRole('link',{name:'All updates →'}).click();
    assert.equal(await page.locator('.member-activity li').count(),50);assert.match(await page.locator('main').innerText(),/128 unread/);
    assert.doesNotMatch(await page.content(),/private-admin|Never show|other@example/);
    for(const width of [1280,375,320]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'updates fit '+width);
      if(process.env.UNANYM_CAPTURE_DIR){mkdirSync(process.env.UNANYM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'updates-'+width+'.png'),fullPage:true});}
    }
    await page.getByRole('button',{name:'Mark shown as read'}).click();assert.match(await page.locator('main').innerText(),/86 unread/);
    await page.getByRole('link',{name:'Older updates'}).click();assert.equal(await page.locator('.member-activity li').count(),50);
    await page.getByRole('button',{name:'Mark shown as read'}).click();assert.match(await page.locator('main').innerText(),/36 unread/);
    await page.getByRole('link',{name:'Older updates'}).click();assert.equal(await page.locator('.member-activity li').count(),36);
    await page.getByRole('button',{name:'Mark shown as read'}).click();assert.match(await page.locator('main').innerText(),/All caught up/);
    await page.goto(origin+'/identity/security');assert.equal(await page.getByRole('button',{name:'Add a passkey'}).count(),0);assert.match(await page.locator('main').innerText(),/Adding a passkey needs JavaScript/);
    await page.goto(origin+'/identity/account');await page.getByRole('button',{name:'Sign out'}).click();assert.equal(await page.getByRole('button',{name:'Send code'}).count(),1);assert.equal(await page.getByRole('button',{name:'Sign in with a passkey'}).count(),0);
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});}
});
