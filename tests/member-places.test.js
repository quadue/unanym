import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {configuration} from '../src/config.js';
import {createService} from '../src/service.js';
import {memberSharing,sharingExport} from '../src/member-sharing.js';
import {independentFixture} from '../scripts/independent-fixture.js';
import {persona,consentReceipt} from '../src/drop.js';

test('sharing projection excludes revoked evidence, stopped connections and client-disabled confirmations without changing saved choices',()=>{
  const membership={slug:'membership',name:'Lakeside',organisation:{name:'Lakeside'}};
  const confirmation={slug:'intro',name:'Introduction completed',organisation:{name:'Lakeside'}};
  const site={name:'Website',homepage:'https://website.example/',allow_confirmations:true,client_secret:'must-not-leave-registry'};
  const rows=[{client:'first',name:'Robin',active:1,memberships:['membership','revoked'],confirmations:['intro','withdrawn'],site},
    {client:'stopped',name:'R.',active:0,memberships:['membership'],confirmations:['intro'],site},
    {client:'unsupported',name:'Rob',active:1,memberships:[],confirmations:['intro'],site:{...site,allow_confirmations:false}},
    {client:'removed',name:'Robin',active:1,memberships:['membership'],confirmations:['intro']}];
  const original=JSON.stringify(rows),state=memberSharing(rows,[membership],[confirmation]);
  assert.equal(JSON.stringify(rows),original);
  assert.equal(state.places.length,3);
  assert.equal(state.places[0].unavailable,2);
  assert.deepEqual(state.places[1].memberships,[]);assert.deepEqual(state.places[1].confirmations,[]);
  assert.deepEqual(state.places[2].confirmations,[]);
  assert.deepEqual(state.confirmations[0].sharedWith,[{client:'first',name:'Website'}]);
  const exported=sharingExport({operatorName:'Example operator'},state);
  assert.doesNotMatch(JSON.stringify(exported),/must-not-leave-registry|revoked|withdrawn/);
  assert.equal(exported.places[1].name_status,'previously_shared');
});

test('long member lists stay bounded on the home and remain reachable in matching complete views without scripts',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-long-lists-')),server=createServer();let service,browser;
  t.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));service?.close();rmSync(dir,{recursive:true,force:true});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,base='/identity',clients=join(dir,'clients.json');
  const registry=Array.from({length:14},(_,i)=>({client_id:'site-'+String(i).padStart(2,'0'),
    name:'Website '+i+' with a longer neighbourhood name',homepage:'https://website-'+i+'.example/',
    sharing_uri:'https://website-'+i+'.example/sharing',description:'Fictional long-list fixture',redirect_uris:['https://website-'+i+'.example/callback']}));
  writeFileSync(clients,JSON.stringify(registry));
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_CLIENTS:clients,
    IDENTITY_OPERATOR_NAME:'Fictional operator',IDENTITY_DEMO:'1',IDENTITY_DATA_DIR:join(dir,'identity')});
  const f=independentFixture({v1:true});
  const records=Array.from({length:14},(_,i)=>({slug:'community-'+i,name:'Community '+i+' with a longer organisation name',
    organisation:{id:'urn:example:community-'+i,name:'Community '+i+' with a longer organisation name'},approvedAt:'2026-09-01T09:00:00Z',validUntil:null}));
  f.adapter.memberships=id=>id==='robin'?records:[];
  service=createService(config,f.adapter);server.on('request',service.app);
  for(const [i,client] of registry.entries()){
    const person=await persona(service.db,'robin',client.client_id,Buffer.from(config.keys.encryption,'base64url'));
    await consentReceipt(service.db,person,{name:'Robin '+i,memberships:[records[i].slug],active:i!==13},config);
    service.db.prepare('INSERT INTO connections VALUES (?,?,?,?,?,?,?)').run('robin',client.client_id,'Robin '+i,
      JSON.stringify([records[i].slug]),null,i!==13?1:0,'2026-09-30T10:00:00Z');
  }
  browser=await chromium.launch();const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:1220,height:920}});
  await context.addCookies([{name:'pl_session',value:f.login('robin'),url:origin}]);const page=await context.newPage();
  await page.goto(origin+base+'/account');
  assert.equal(await page.locator('.member-site').count(),6);assert.equal(await page.locator('.member-community').count(),6);
  assert.equal(await page.getByRole('heading',{name:'One you. 13 places.',exact:true}).count(),1);
  assert.match(await page.locator('.member-out .member-list-more').innerText(),/Showing 6 of 14 websites/);
  assert.match(await page.locator('.member-in .member-list-more').innerText(),/Showing 6 of 14 communities/);
  assert.equal(await page.locator('.member-activity li').count(),8);
  const ground=await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor);
  const capture=async name=>{if(process.env.UNANYM_CAPTURE_DIR){mkdirSync(process.env.UNANYM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,name+'.png'),fullPage:true,animations:'disabled'});}};
  for(const width of [1220,860,375,320]){
    await page.setViewportSize({width,height:920});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'home width '+width);
    if(width===1220||width===375)await capture('long-home-'+width);
  }
  await page.getByRole('link',{name:'View all connections',exact:false}).click();
  assert.equal(await page.locator('.place-card').count(),14);assert.equal(await page.locator('.place-disconnected').count(),1);
  assert.equal(await page.locator('header [aria-current=page]').innerText(),'Connections');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),ground);
  await page.goto(origin+base+'/sites?place=site-12');const last=page.locator('[data-place="site-12"]');
  assert.equal(await last.locator('.place-sharing').evaluate(d=>d.open),true);
  for(const width of [1220,375,320]){
    await page.setViewportSize({width,height:920});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'connections width '+width);
    if(width===1220||width===375)await capture('long-connections-'+width);
  }
  await last.getByRole('button',{name:'Disconnect',exact:true}).click();await page.waitForURL('**/identity/sites');
  assert.equal(service.db.prepare('SELECT active FROM connections WHERE account=? AND client=?').get('robin','site-12').active,0);
  assert.equal(service.db.prepare('SELECT active FROM connections WHERE account=? AND client=?').get('robin','site-11').active,1);
  await page.goto(origin+base+'/account');await page.getByRole('link',{name:'View all records',exact:false}).click();
  assert.equal(await page.locator('.member-record').count(),14);
  assert.equal(await page.locator('header [aria-current=page]').innerText(),'Records');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),ground);
  for(const width of [1220,375,320]){
    await page.setViewportSize({width,height:920});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'records width '+width);
    if(width===1220||width===375)await capture('long-records-'+width);
  }
  await page.getByRole('link',{name:registry[11].name,exact:true}).click();
  assert.equal(await page.locator('[data-place="site-11"] .place-sharing').evaluate(d=>d.open),true);
});

test('member places: two consented identities, scoped records, current evidence, private export and one-site disconnection without scripts',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-places-')),server=createServer();
  let service,browser;
  t.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));service?.close();rmSync(dir,{recursive:true,force:true});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,base='/identity/v1';
  const websiteOrigin=id=>id==='first'?origin:origin.replace('127.0.0.1','localhost');
  const clients=join(dir,'clients.json');
  writeFileSync(clients,JSON.stringify(['first','second'].map((id,i)=>({client_id:id,name:i?'Neighbourhood website':'Learning exchange',
    homepage:websiteOrigin(id)+'/'+id,sharing_uri:websiteOrigin(id)+'/'+id+'/sharing',description:'Fictional receiving website',allow_confirmations:true,redirect_uris:[websiteOrigin(id)+'/'+id+'/callback']}))));
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_BASE_PATH:base,IDENTITY_CLIENTS:clients,
    IDENTITY_OPERATOR_NAME:'Example operator',IDENTITY_DISPLAY_NAME:'FRRN',IDENTITY_DEMO:'1',IDENTITY_DATA_DIR:join(dir,'data')});
  const f=independentFixture({v1:true}),memberships=f.adapter.memberships,withdrawn=new Set();
  f.adapter.memberships=id=>memberships(id).filter(m=>!withdrawn.has(m.slug));
  f.adapter.confirmations=id=>f.adapter.memberships(id).filter(m=>m.slug==='lakeside').map(m=>({slug:'intro',name:'Community introduction completed',organisation:m.organisation,confirmedAt:'2026-09-12T10:00:00Z',validUntil:null}));
  service=createService(config,f.adapter);server.on('request',service.app);
  browser=await chromium.launch();
    const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:1220,height:920}});
    await context.addCookies([{name:'pl_session',value:f.login('robin'),url:origin}]);
    const page=await context.newPage();
    const connect=async(id,name,shareConfirmation)=>{
      const verifier=randomBytes(32).toString('base64url'),redirect=websiteOrigin(id)+'/'+id+'/callback';
      const params=new URLSearchParams({client_id:id,redirect_uri:redirect,response_type:'code',scope:'openid profile identity.v1 memberships.v1 confirmations.v1',state:'test-state',nonce:'test-nonce',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
      await page.goto(config.issuer+'/auth?'+params);await page.getByLabel('Your name on this website').fill(name);
      await page.getByRole('checkbox',{name:/^Lakeside/}).check();
      if(shareConfirmation)await page.getByRole('checkbox',{name:/Community introduction/}).check();
      await page.getByRole('button',{name:'Allow and continue'}).click();await page.waitForURL('**/'+id+'/callback?**');
      const code=new URL(page.url()).searchParams.get('code');assert.ok(code);
      const response=await fetch(config.issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'authorization_code',client_id:id,code,redirect_uri:redirect,code_verifier:verifier})});
      assert.equal(response.status,200);return (await response.json()).access_token;
    };
    const first=await connect('first','Robin',true),second=await connect('second','R.',false);
    const info=token=>fetch(config.issuer+'/me',{headers:{Authorization:'Bearer '+token}});
    const firstInfo=await (await info(first)).json(),secondInfo=await (await info(second)).json();
    assert.notEqual(firstInfo.sub,secondInfo.sub);
    const unchanged=()=>JSON.stringify(['connections','receipts','personas'].map(table=>service.db.prepare('SELECT * FROM '+table).all()));
    const beforeHome=unchanged();
    await page.goto(origin+base+'/account');
    assert.equal(await page.title(),'Your FRRN · FRRN');assert.equal(await page.getByRole('heading',{name:'One you. Two places.',exact:true}).count(),1);
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('header [aria-current="page"]').innerText(),'Your FRRN');
    assert.equal(await page.locator('.member-activity li').count(),2);
    assert.equal(await page.locator('.member-site').count(),2);assert.equal(await page.locator('.member-community').count(),2);
    for(const [id,subject] of [['first',firstInfo.sub],['second',secondInfo.sub]]){
      const card=page.locator('[data-place="'+id+'"]');
      await card.locator('.place-identity>summary').click();
      assert.equal(await card.locator('.place-identity dd').first().innerText(),subject);
      assert.match(await card.locator('.place-identity dd').last().innerText(),/^[a-f0-9]{64}$/);
    }
    assert.equal(unchanged(),beforeHome,'inspecting identity and records creates no keys, permission or history');
    const homeResponse=await page.request.get(origin+base+'/account');assert.equal(homeResponse.headers()['cache-control'],'no-store');
    const homeHTML=await homeResponse.text();
    for(const row of service.db.prepare('SELECT private_key FROM personas').all())assert.equal(homeHTML.includes(row.private_key),false);
    if(process.env.UNANYM_CAPTURE_DIR){mkdirSync(process.env.UNANYM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'home-desktop.png'),fullPage:true});}
    for(const width of [375,320]){
      await page.setViewportSize({width,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.UNANYM_CAPTURE_DIR)await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'home-'+width+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:1220,height:920});
    await page.goto(origin+base+'/sites?place=first');
    const firstCard=page.locator('[data-place="first"]'),secondCard=page.locator('[data-place="second"]');
    assert.equal(await firstCard.locator('.place-person strong').innerText(),'Robin');
    assert.equal(await secondCard.locator('.place-person strong').innerText(),'R.');
    assert.match(await firstCard.innerText(),/Lakeside community/);assert.doesNotMatch(await firstCard.innerText(),/Private listening circle/);
    assert.equal(await firstCard.locator('.place-sharing').evaluate(d=>d.open),true);
    assert.equal(await firstCard.getByRole('link',{name:'Change sharing'}).getAttribute('href'),origin+'/first/sharing');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.UNANYM_CAPTURE_DIR){mkdirSync(process.env.UNANYM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'places-desktop.png'),fullPage:true});}
    await page.setViewportSize({width:375,height:812});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.UNANYM_CAPTURE_DIR)await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'places-mobile.png'),fullPage:true});
    await secondCard.locator('.place-sharing>summary').click();assert.equal(await secondCard.locator('.place-sharing').evaluate(d=>d.open),true);
    await firstCard.locator('.place-sharing>summary').focus();await page.keyboard.press('Enter');assert.equal(await firstCard.locator('.place-sharing').evaluate(d=>d.open),true);
    await page.goto(origin+base+'/records');
    const confirmation=page.locator('.member-record').filter({has:page.getByRole('heading',{name:'Community introduction completed',exact:true})});
    assert.match(await confirmation.innerText(),/Learning exchange/);assert.doesNotMatch(await confirmation.innerText(),/Neighbourhood website/);
    await confirmation.getByRole('link',{name:'Learning exchange'}).click();assert.equal(await firstCard.locator('.place-sharing').evaluate(d=>d.open),true);
    const exportResponse=await page.request.get(origin+base+'/sharing-summary');assert.equal(exportResponse.status(),200);assert.equal(exportResponse.headers()['cache-control'],'no-store');
    const exported=await exportResponse.json();assert.equal(exported.places.length,2);assert.equal(exported.confirmations[0].shared_with.length,1);
    assert.doesNotMatch(JSON.stringify(exported),/private_key|client_secret|access_token|pl_session/);
    for(const path of ['/account','/sites','/records','/sharing-summary'])assert.equal((await fetch(origin+base+path,{redirect:'manual'})).status,302,'private page requires a member session');
    const sam=await browser.newContext();await sam.addCookies([{name:'pl_session',value:f.login('sam'),url:origin}]);
    const samPage=await sam.newPage();await samPage.goto(origin+base+'/sites?place=first');assert.equal(await samPage.locator('.place-card').count(),0);
    assert.equal(await samPage.getByRole('link',{name:'Try the example website'}).count(),0,'no dead example link on installations without an example client');
    assert.deepEqual((await (await samPage.request.get(origin+base+'/sharing-summary')).json()).places,[]);
    await samPage.goto(origin+base+'/records');assert.equal(await samPage.locator('.member-record').count(),0);
    await samPage.goto(origin+base+'/account');assert.equal(await samPage.locator('.member-community,.member-site,.member-activity li').count(),0);
    assert.doesNotMatch(await samPage.locator('main').innerText(),/Lakeside community|Learning exchange|Private listening circle|Neighbourhood website/);
    const forged=await samPage.request.post(origin+base+'/sites/first/disconnect',{headers:{Origin:origin},form:{csrf:'forged'}});assert.equal(forged.status(),403);
    await sam.close();
    config.clients[0].allow_confirmations=false;
    await page.goto(origin+base+'/records');assert.doesNotMatch(await confirmation.innerText(),/Learning exchange/,'disabled receiving capability is not shown as shared');
    config.clients[0].allow_confirmations=true;withdrawn.add('lakeside');
    await page.goto(origin+base+'/sites?place=first');assert.match(await firstCard.innerText(),/No memberships shared/);assert.match(await firstCard.innerText(),/No confirmations shared/);
    assert.match(await firstCard.innerText(),/Some earlier choices are no longer available/);
    const current=await (await info(first)).json();assert.deepEqual(current.memberships_v1.statements,[]);assert.deepEqual(current.confirmations_v1.statements,[]);
    await page.goto(origin+base+'/records');assert.equal(await page.locator('.member-record').count(),1,'only the other current membership remains');
    withdrawn.clear();await page.goto(origin+base+'/sites?place=first');
    await firstCard.getByRole('button',{name:'Disconnect',exact:true}).click();await page.waitForURL('**'+base+'/sites');
    assert.equal((await info(first)).status,401);assert.equal((await info(second)).status,200);
    assert.match(await firstCard.innerText(),/Previously known as/);assert.match(await firstCard.innerText(),/Sharing stopped/);
    const disconnected=(await (await page.request.get(origin+base+'/sharing-summary')).json()).places.find(p=>p.website_name==='Learning exchange');
    assert.deepEqual(disconnected.memberships,[]);assert.deepEqual(disconnected.confirmations,[]);
    await page.goto(origin+base+'/account');assert.match(await page.locator('.member-activity li').first().innerText(),/Disconnected.*Learning exchange/s);
    assert.match(await firstCard.innerText(),/Stopped/);assert.match(await secondCard.innerText(),/Sees\s+R\./);
    assert.equal(await page.locator('.member-site.off').count(),1);
    await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.UNANYM_CAPTURE_DIR){await page.goto(origin+base+'/records');await page.screenshot({path:join(process.env.UNANYM_CAPTURE_DIR,'records-mobile.png'),fullPage:true});}
});
