import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {renderMarkdown,slug} from '../src/markdown.js';
import {configuration} from '../src/config.js';
import {createService} from '../src/service.js';
import {independentFixture} from '../scripts/independent-fixture.js';

const {version}=JSON.parse(readFileSync('package.json','utf8'));

test('documentation renderer escapes source, keeps only known links and matches GitHub anchors',()=>{
  const html=renderMarkdown('# A <b>title</b> — v1\n\nSee [hosting](standalone.md#start-a-new-installation), [x](javascript:alert(1)), [ext](https://example.org) and [missing](nope.md).\n\n```html\n<script>alert(1)</script> **not bold**\n```\n\n| a | b |\n| --- | --- |\n| `<i>` | **c** |\n\n1. one\n   continued\n2. two\n',{links:{'standalone.md':'hosting'}});
  assert.match(html,/<h1 id="a-btitleb--v1">A &lt;b&gt;title&lt;\/b&gt; — v1<\/h1>/);
  assert.match(html,/<a href="hosting#start-a-new-installation">hosting<\/a>/);
  assert.match(html,/<a href="https:\/\/example.org">ext<\/a>/);
  assert.doesNotMatch(html,/javascript:alert|href="nope\.md"/);
  assert.match(html,/missing/);
  assert.match(html,/<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt; \*\*not bold\*\*<\/code><\/pre>/);
  assert.match(html,/<td><code>&lt;i&gt;<\/code><\/td><td><strong>c<\/strong><\/td>/);
  assert.match(html,/<ol><li>one continued<\/li><li>two<\/li><\/ol>/);
  assert.doesNotMatch(html,/<script>|<b>|<i>/);
  assert.equal(slug('Changing the underlying engine'),'changing-the-underlying-engine');
});

function host({example=true,operator='Test <operator>'}={}) {
  const dir=mkdtempSync(join(tmpdir(),'unanym-portal-')),server=createServer();
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{
    const origin='http://127.0.0.1:'+server.address().port,clients=join(dir,'clients.json');
    writeFileSync(clients,JSON.stringify(example?[{client_id:'example',name:'Example website',description:'Fictional test only',homepage:origin+'/identity/example/',redirect_uris:[origin+'/identity/example/callback']}]:[]));
    const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:operator,IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:join(dir,'identity')});
    const f=independentFixture({v1:true}),service=createService(config,f.adapter);
    server.on('request',service.app);
    resolve({origin,f,close:async()=>{await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});}});
  }));
}

test('guides and reference documents render for a community-v1 host, with the operator name escaped',async()=>{
  const h=await host({example:false});
  try{
    const get=async path=>{const r=await fetch(h.origin+path);return {status:r.status,type:r.headers.get('content-type'),text:await r.text()};};
    const index=await get('/identity/docs/');assert.equal(index.status,200);
    for(const name of ['organisers','members','websites','operators']){
      assert.match(index.text,new RegExp('href="/identity/docs/'+name+'"'));
      const guide=await get('/identity/docs/'+name);assert.equal(guide.status,200);assert.doesNotMatch(guide.text,/<operator>/);
    }
    assert.match((await get('/identity/docs/members')).text,/The operator \(Test &lt;operator&gt;\)/);
    assert.match((await get('/identity/docs/organisers')).text,/Revoke membership/,'a standalone host describes its own administrator screens');
    const contract=await get('/identity/docs/contract');assert.match(contract.text,/<h2 id="changing-the-underlying-engine">/);
    for(const name of ['hosting','frrn-host','release-notes'])assert.equal((await get('/identity/docs/'+name)).status,200);
    assert.match((await get('/identity/docs/community-v1.md')).type,/text\/plain/,'the raw contract stays available');
    assert.equal((await (await fetch(h.origin+'/identity/health')).json()).version,version);
    assert.equal((await get('/identity/example/')).status,404,'no example without an explicit registration');
    assert.match((await get('/identity/developers')).text,/<div hidden>/,'the overview hides the example link');
  }finally{await h.close();}
});

test('the hosted example is a real receiving site: consent, verified claims, no reuse, decline',async()=>{
  const h=await host(),browser=await chromium.launch();
  try{
    const context=await browser.newContext();
    await context.addCookies([{name:'pl_session',value:h.f.login('robin'),url:h.origin}]);
    const page=await context.newPage();
    await page.goto(h.origin+'/identity/developers');
    await page.getByRole('link',{name:'Open the example website'}).click();
    await page.getByRole('link',{name:/Continue with/}).click();
    await page.getByLabel('Your name on this website').fill('Robin');
    await page.getByRole('checkbox',{name:/Lakeside/}).check();
    await page.getByRole('button',{name:'Allow and continue'}).click();
    await page.waitForURL('**/identity/example/callback**');
    const html=await page.content();
    assert.match(html,/Hello, Robin\./);
    assert.match(html,/Lakeside community<\/strong><small>Approved 2026-09-01 · no scheduled end · signed by the operator, signature valid/);
    assert.doesNotMatch(html,/Private listening circle/,'an unticked membership never arrives');
    assert.doesNotMatch(html,/robin/,'the account identifier never arrives');
    assert.match(html,/Test &lt;operator&gt;/);
    await page.reload();assert.equal(await page.locator('h1').innerText(),'This sign-in has expired.');
    const forged=await page.request.get(h.origin+'/identity/example/callback?state=guess&code=guess');assert.equal(forged.status(),400);
    await page.goto(h.origin+'/identity/example/start?change=1');
    assert.equal(await page.getByLabel('Your name on this website').inputValue(),'Robin','a change starts from the previous choice');
    await page.getByRole('button',{name:'Not now'}).click();await page.waitForURL('**/identity/example/callback**');
    assert.equal(await page.locator('h1').innerText(),'You chose not to connect.');
  }finally{await browser.close();await h.close();}
});
