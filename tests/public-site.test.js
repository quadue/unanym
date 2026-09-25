import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPublicSite} from '../src/public-site.js';
import {chromium,expect} from '@playwright/test';

test('public Unanym pages have independent branding and no account or issuer endpoints',async()=>{
  const server=createPublicSite().listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/','/learn','/docs/','/docs/websites','/docs/members','/docs/organisers','/docs/operators','/docs/webmaster-questions','/docs/hosting']){
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
