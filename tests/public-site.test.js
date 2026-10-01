import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPublicSite} from '../src/public-site.js';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';

test('public entry creates one verified persistent account and resumes it without granting memberships or connections',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-entry-')),server=createServer(),mail=[];
  let service,publicServer,browser;
  t.after(async()=>{await browser?.close();if(publicServer)await new Promise(r=>publicServer.close(r));await new Promise(r=>server.close(r));service?.close();rmSync(dir,{recursive:true,force:true});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const clients=join(dir,'clients.json');writeFileSync(clients,'[]');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Fictional test operator',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:join(dir,'identity')});
  const options={bootstrapEmail:'operator@example.test',sendCode:async m=>mail.push(m)};
  service=createStandalone(config,options);server.on('request',service.app);
  publicServer=createPublicSite({accountURL:origin+'/identity/account'}).listen(0,'127.0.0.1');await once(publicServer,'listening');
  const publicOrigin='http://127.0.0.1:'+publicServer.address().port;
  browser=await chromium.launch();const page=await browser.newPage({javaScriptEnabled:false,viewport:{width:375,height:812},reducedMotion:'reduce'});
  const capture=async name=>{if(process.env.UNANYM_CAPTURE_DIR){mkdirSync(process.env.UNANYM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,name+'.png'),fullPage:true});}};
  await page.goto(publicOrigin+'/');await capture('account-entry-landing');
  await page.locator('.landing-intro').getByRole('link',{name:'Create your nym',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your Unanym',exact:true})).toBeVisible();
  await expect(page.getByText('Confirm it to create your account', {exact:false})).toBeVisible();
  for(const width of [1220,375,320]){
    await page.setViewportSize({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'account entry '+width);
  }
  await capture('account-entry-email');
  await page.getByLabel('Email address').fill('new-member@example.test');await page.getByRole('button',{name:'Send code',exact:true}).click();
  assert.equal(service.accounts.db.prepare('SELECT count(*) n FROM accounts').get().n,0,'requesting a code does not create an unverified member');
  assert.equal(mail.length,1);await page.getByLabel('Sign-in code').fill(mail[0].code);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(origin+'/identity/account');
  await expect(page.getByRole('heading',{name:'One you. No places yet.',exact:true})).toBeVisible();
  await expect(page.locator('.member-email')).toHaveText('new-member@example.test');
  await expect(page.locator('.member-site,.member-community')).toHaveCount(0);
  const account=service.accounts.db.prepare('SELECT id,verified FROM accounts').get();assert.equal(account.verified,1);
  for(const table of ['memberships','operators','administrators'])assert.equal(service.accounts.db.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
  for(const table of ['personas','connections'])assert.equal(service.db.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
  await capture('account-entry-home');
  // Restart the account service against the same store; the member session and account survive.
  server.removeAllListeners('request');service.close();service=createStandalone(config,options);server.on('request',service.app);
  await page.goto(publicOrigin+'/');await page.getByRole('link',{name:'Sign in',exact:true}).click();
  await page.waitForURL(origin+'/identity/account');assert.equal(mail.length,1);
  assert.equal(service.accounts.db.prepare('SELECT id FROM accounts').get().id,account.id);
  assert.equal(service.accounts.db.prepare('SELECT count(*) n FROM accounts').get().n,1);
  await page.goto(origin+'/identity/login');await page.waitForURL(origin+'/identity/account');
  for(const path of ['/','/identity/']){
    await page.goto(origin+path);await page.waitForURL(origin+'/identity/account');
    await expect(page.locator('.place-select')).toHaveCount(0);
  }
  await page.goto(publicOrigin+'/learn');await capture('account-entry-learn');
  await page.getByRole('link',{name:'Create your nym',exact:true}).click();await page.waitForURL(origin+'/identity/account');
  assert.equal(mail.length,1,'creating again resumes the same signed-in account');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(origin+'/identity/login');
  assert.equal((await page.request.get(origin+'/identity/account',{maxRedirects:0})).status(),302);
  await page.goto(origin+'/identity/');await page.waitForURL('**/identity/login?next=**');
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('public Unanym pages have independent branding and no account or issuer endpoints',async()=>{
  for(const accountURL of ['javascript:alert(1)','https://user:secret@example.test/account','https://example.test/account#fragment','http://example.test/account'])
    assert.throws(()=>createPublicSite({accountURL}),/Account URL/);
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/','/overview','/developers','/learn','/docs/','/docs/websites','/docs/members','/docs/organisers','/docs/operators','/docs/webmaster-questions','/docs/hosting','/docs/wordpress-trial']){
      const r=await fetch(origin+path),html=await r.text();assert.equal(r.status,200,path);
      assert.match(html,/Unanym/);assert.doesNotMatch(html,/FRRN|Firn|frrn\.life|\{\{/i,path);
      assert.equal(r.headers.get('set-cookie'),null);
      assert.match(r.headers.get('content-security-policy'),/form-action 'none'/);
      const links=[...html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)].map(x=>x[1]);
      for(const link of new Set(links))assert.equal((await fetch(origin+link)).status,200,path+' -> '+link);
    }
    for(const path of ['/login','/account','/sites','/oidc/.well-known/openid-configuration','/identity/oidc/.well-known/openid-configuration','/keys.json','/clients.json'])
      assert.equal((await fetch(origin+path)).status,404,path);
    assert.equal((await fetch(origin+'/learn',{method:'POST',body:'no-account-writes'})).status,404);
    const report=await fetch(origin+'/docs/wordpress-trial-report.md');
    assert.equal(report.status,200);assert.match(report.headers.get('content-disposition'),/attachment/);
    assert.match(await report.text(),/Status: NOT CONDUCTED/);
    const old=await fetch(origin+'/identity/v1/docs/websites',{redirect:'manual'});
    assert.equal(old.status,308);assert.equal(old.headers.get('location'),'/docs/websites');
    const overview=await fetch(origin+'/identity/v1/developers',{redirect:'manual'});
    assert.equal(overview.headers.get('location'),'/developers');
  }finally{await new Promise(r=>server.close(r));}
});

test('configured community links work without scripts and load no external content',async t=>{
  for(const name of ['sourceURL','communityURL']){
    for(const value of ['javascript:alert(1)','http://example.test/','https://user:secret@example.test/','https://example.test/?token=private','https://example.test/#fragment'])
      assert.throws(()=>createPublicSite({[name]:value}),new RegExp(name==='sourceURL'?'Source URL':'Community URL'));
  }
  const sourceURL='https://github.com/example/unanym',communityURL='https://t.me/example_community';
  const server=createPublicSite({sourceURL,communityURL}).listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
  const page=await browser.newPage({javaScriptEnabled:false,reducedMotion:'reduce'}),external=[];
  page.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.url());});
  for(const width of [1440,860,375,320]){
    await page.setViewportSize({width,height:900});await page.goto(origin+'/');
    const community=page.locator('.landing-community');await community.scrollIntoViewIfNeeded();
    await expect(community.getByRole('link',{name:'Telegram discussion',exact:true})).toHaveAttribute('href',communityURL);
    await expect(community.getByRole('link',{name:'Source on GitHub',exact:true})).toHaveAttribute('href',sourceURL);
    await expect(page.locator('.site-header nav a')).toHaveCount(2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'community links '+width);
  }
  await page.goto(origin+'/docs/operators');
  await expect(page.getByRole('link',{name:'Get the source on GitHub',exact:true})).toHaveAttribute('href',sourceURL);
  assert.deepEqual(external,[],'ordinary links do not load a chat widget or GitHub content');
  const unconfigured=createPublicSite().listen(0,'127.0.0.1');await once(unconfigured,'listening');
  try{
    const html=await(await fetch('http://127.0.0.1:'+unconfigured.address().port+'/')).text();
    assert.doesNotMatch(html,/class="landing-community"|Telegram discussion|Source on GitHub/);
  }finally{await new Promise(r=>unconfigured.close(r));}
});

test('public learning explains real accounts on a phone without simulated sharing or writes',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    for(const javaScriptEnabled of [true,false]){
      const context=await browser.newContext({javaScriptEnabled,viewport:{width:375,height:812},reducedMotion:'reduce'});
      const page=await context.newPage(),writes=[];
      page.on('request',r=>{if(r.method()!=='GET'||new URL(r.url()).origin!==origin)writes.push(r.url());});
      await page.goto(origin+'/learn');
      await expect(page.getByRole('link',{name:'Create your nym',exact:true})).toHaveAttribute('href','https://unanym.org/identity/account');
      await expect(page.locator('.learn-cards article')).toHaveCount(3);
      await expect(page.locator('#practice-app,select,input,form')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText(/practice|pretend|hypothetical|alpha/i);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(writes,[]);assert.deepEqual(await context.cookies(),[]);
      await page.getByRole('link',{name:'Privacy',exact:true}).click();
      await expect(page.locator('#privacy-details')).toHaveAttribute('open','');
      await expect(page.locator('#privacy-details')).toContainText('holds the records and signing keys');
      await context.close();
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('public landing shows the shape in few words and leads to details on request',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    for(const width of [1440,860,375,320]){
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      await page.goto(origin+'/');
      await expect(page.getByRole('heading',{level:1})).toHaveText('One you. Many places.');
      await expect(page.locator(width>860?'.geo-hero-wide':'.geo-hero-tall')).toBeVisible();
      await expect(page.locator(width>860?'.geo-hero-tall':'.geo-hero-wide')).toBeHidden();
      const count=text=>text.split(/\s+/).filter(Boolean).length;
      const hero=await page.locator('.landing-intro').innerText();
      assert.ok(count(hero)<=25,`hero shows ${count(hero)} words`);
      for(const chapter of await page.locator('.chapter-text').allInnerTexts())assert.ok(count(chapter)<=35,chapter);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.close();
    }
    const still=await browser.newPage({reducedMotion:'reduce'});await still.goto(origin+'/');
    // Gradient strokes must not be overridden by the stylesheet, and nothing moves when motion is reduced.
    assert.match(await still.locator('.geo-hero .link[stroke]').first().evaluate(e=>getComputedStyle(e).stroke),/^url\(/);
    assert.equal(await still.locator('.mover').evaluateAll(els=>els.filter(e=>e.checkVisibility()).length),0);
    await expect(still.locator('.geo-hero-wide .cube')).toHaveCount(1);
    await expect(still.locator('.geo-hero-wide .label')).toHaveText(['You','Identity service','Your communities','Websites']);
    await expect(still.locator('.geo-chapter .cross')).toHaveCount(0);
    await still.close();
    const page=await browser.newPage();await page.goto(origin+'/');
    await page.locator('.landing-intro').getByRole('link',{name:'How it works'}).click();
    await expect(page.getByRole('heading',{name:'How Unanym works',exact:true})).toBeVisible();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('public explanation consolidates old entry pages and keeps setup and technical detail contextual',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    for(const path of ['/overview','/docs/members']){
      const redirect=await fetch(origin+path,{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/learn');
    }
    const page=await browser.newPage({viewport:{width:375,height:812},javaScriptEnabled:false});
    await page.goto(origin+'/docs/members#who-can-connect-the-dots');
    await expect(page).toHaveURL(origin+'/learn#who-can-connect-the-dots');
    await expect(page.locator('#privacy-details')).toHaveAttribute('open','');
    await expect(page.locator('#privacy-details')).toContainText('can link your websites');
    await page.goto(origin+'/overview');await expect(page).toHaveURL(origin+'/learn');
    await expect(page.getByRole('heading',{level:1})).toHaveText('How Unanym works');
    await expect(page.getByRole('link',{name:'Create your nym'})).toHaveAttribute('href','https://unanym.org/identity/account');
    await expect(page.locator('.learn-questions details[open]')).toHaveCount(0);
    await page.getByText('Do you run a website or community?',{exact:true}).click();
    await page.getByRole('link',{name:'Connect a website',exact:true}).click();
    await expect(page.getByRole('heading',{level:1})).toHaveText('Connect a website');
    await expect(page.locator('.dev-flow')).not.toHaveAttribute('open','');
    await page.getByText('See the connection steps',{exact:true}).click();
    await expect(page.locator('.flow-shot')).toHaveCount(4);
    await expect(page.locator('.flow-shot').first()).toBeVisible();
    for(const path of ['/overview','/developers','/docs/','/','/learn']){
      await page.goto(origin+path);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(23, 24, 30)',path);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path);
    }
    await page.goto(origin+'/');
    await expect(page.getByRole('navigation',{name:'Main'}).locator('a')).toHaveText(['How it works','Sign in']);
    await expect(page.locator('.landing-example')).toBeVisible();
    await expect(page.locator('.example-steps li')).toHaveCount(4);
    await expect(page.locator('.chapter')).toHaveCount(4);
    await expect(page.locator('main input,main form')).toHaveCount(0);
    await page.getByRole('link',{name:'What websites see',exact:true}).click();
    await expect(page).toHaveURL(origin+'/learn#sharing');
    await expect(page.locator('#sharing-details')).toHaveAttribute('open','');
    await page.goto(origin+'/');
    await page.getByRole('link',{name:'Documentation',exact:true}).click();
    await expect(page.getByRole('heading',{level:1})).toHaveText('Documentation');
    await expect(page.locator('.doc-reference')).not.toHaveAttribute('open','');
    await page.getByText('Technical reference',{exact:true}).click();
    await expect(page.getByRole('link',{name:'Identity v1 contract',exact:true})).toBeVisible();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
