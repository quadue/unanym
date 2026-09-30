import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPublicSite} from '../src/public-site.js';
import {chromium,expect} from '@playwright/test';

test('public Unanym pages have independent branding and no account or issuer endpoints',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/','/overview','/developers','/learn','/docs/','/docs/websites','/docs/members','/docs/organisers','/docs/operators','/docs/webmaster-questions','/docs/hosting']){
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
    const old=await fetch(origin+'/identity/v1/docs/websites',{redirect:'manual'});
    assert.equal(old.status,308);assert.equal(old.headers.get('location'),'/docs/websites');
    const overview=await fetch(origin+'/identity/v1/developers',{redirect:'manual'});
    assert.equal(overview.headers.get('location'),'/developers');
  }finally{await new Promise(r=>server.close(r));}
});

test('public member practice completes on a phone without signing in or sending choices',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'}),writes=[];
    page.on('request',r=>{if(r.method()!=='GET'||new URL(r.url()).origin!==origin)writes.push(r.url());});
    await page.goto(origin+'/learn');
    await page.getByRole('button',{name:'Continue with Unanym',exact:true}).click();
    await expect(page.locator('#practice-progress')).toHaveText('Step 1 of 3 · Choosing with Unanym');
    await page.getByLabel('Your name on this website').selectOption('River');
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'Allow and continue',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Welcome, River.'})).toBeVisible();
    await page.getByRole('button',{name:'Manage what I share',exact:true}).click();
    await page.getByRole('button',{name:'Disconnect',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Practice connection ended'})).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(writes,[]);
    await page.getByRole('link',{name:'Member guide',exact:true}).click();
    await expect(page.getByRole('heading',{name:'For members',exact:true})).toBeVisible();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('public landing shows the shape in few words and leads to details on request',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    for(const width of [1440,375]){
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      await page.goto(origin+'/');
      await expect(page.getByRole('heading',{level:1})).toHaveText('One you. Many places.');
      await expect(page.locator('.geo-hero')).toBeVisible();
      const count=text=>text.split(/\s+/).filter(Boolean).length;
      const hero=await page.locator('.landing-intro').innerText();
      assert.ok(count(hero)<=25,`hero shows ${count(hero)} words`);
      for(const chapter of await page.locator('.chapter-text').allInnerTexts())assert.ok(count(chapter)<=35,chapter);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.close();
    }
    const page=await browser.newPage();await page.goto(origin+'/');
    await page.locator('.landing-intro').getByRole('link',{name:'How it works'}).click();
    await expect(page.getByRole('heading',{name:'Does not receive'})).toBeVisible();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('public overview addresses members first and states what websites do not receive',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:375,height:812}});
    await page.goto(origin+'/overview');
    await expect(page.getByRole('heading',{level:1})).toContainText('Show you belong.');
    await expect(page.getByRole('link',{name:'Try the member walkthrough'})).toHaveAttribute('href','/learn');
    await expect(page.getByRole('link',{name:'Set up a website'})).toHaveAttribute('href','/developers');
    await expect(page.getByRole('heading',{name:'Does not receive'})).toBeVisible();
    await expect(page.getByText('can see which websites you connect')).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.getByRole('link',{name:'Set up a website'}).click();
    await expect(page.getByRole('heading',{name:'Connect WordPress'})).toBeVisible();
    await page.getByRole('link',{name:'unanym',exact:true}).click();
    await expect(page).toHaveURL(origin+'/');
    await expect(page.getByRole('heading',{level:1})).toHaveText('One you. Many places.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
