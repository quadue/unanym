// Real WordPress pages, real walt.id v2 issuer/wallet, fictional accounts only.
// Requires the two dedicated loopback labs and walt.id services from README.md.
import {chromium,expect} from '@playwright/test';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {configuration} from '../../src/config.js';
import {createService} from '../../src/service.js';
import {independentFixture} from '../../scripts/independent-fixture.js';
import {createWalletBridge} from '../../src/wallet/bridge.js';
import {testIssuerKey} from './issuer-key.js';
import {issueMembership,membershipKey} from '../../src/community-contract.js';

const origin='http://localhost:7010',issuer='http://127.0.0.1:7005',wallet='http://127.0.0.1:7006',status='http://localhost:7012';
const sites=[{id:'wallet-a',container:'unanym-wallet-a-wp',origin:'http://localhost:7082',allow:true},{id:'wallet-b',container:'unanym-wallet-b-wp',origin:'http://127.0.0.1:7083',allow:false}];
const org='urn:example:lakeside-association',hosted='urn:example:lakeside-community';
const dir=mkdtempSync(join(tmpdir(),'unanym-wallet-wp-')),out=resolve('data/wallet-wordpress-evidence');mkdirSync(out,{recursive:true});
const secret=randomBytes(32).toString('base64url');
const clients=sites.map(s=>({client_id:s.id,name:s.id==='wallet-a'?'Lakeside local':'Lakeside international',description:'Fictional WordPress lab',
  allow_wallet_memberships:s.allow,allow_refresh:true,token_endpoint_auth_method:'client_secret_post',homepage:s.origin,sharing_uri:s.origin+'/?unanym_share=1',redirect_uris:[s.origin+'/wp-admin/admin-ajax.php?action=openid-connect-authorize']}));
writeFileSync(join(dir,'clients.json'),JSON.stringify(clients));writeFileSync(join(dir,'secrets.json'),JSON.stringify(Object.fromEntries(sites.map(s=>[s.id,secret]))),{mode:0o600});
const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Fictional wallet lab',IDENTITY_DEMO:'1',
  IDENTITY_DATA_DIR:join(dir,'identity'),IDENTITY_CLIENTS:join(dir,'clients.json'),IDENTITY_CLIENT_SECRETS:join(dir,'secrets.json')});
const f=independentFixture({v1:true});
const bridge=createWalletBridge(config,{trust:[{issuer:'http://localhost:7005/openid4vci',publicJwk:testIssuerKey().publicJwk,alg:'ES256',
  vct:'http://localhost:7005/openid4vci/community_membership',organisationId:org}],maxStatusAge:20,refreshMs:5000});
const service=createService(config,bridge.adapter(f.adapter),{mountRoutes:app=>bridge.mount(app,{session:f.adapter.session,csrfBinding:f.adapter.csrfBinding})});
const server=service.app.listen(7010,'127.0.0.1');await once(server,'listening');
const statusProcess=spawn(process.execPath,['experiments/wallet/org-status.js'],{stdio:['ignore','ignore','inherit']});
const wp=(s,...args)=>execFileSync('docker',['exec',s.container,'php','/usr/local/bin/wp-cli.phar','--allow-root',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const json=async(method,url,body)=>{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)});if(!r.ok)throw Error('Wallet lab API refused request: '+r.status);return r.json();};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[],measurements={};const pass=(name,detail)=>{checks.push({name,ok:true,...(detail===undefined?{}:{detail})});console.log('PASS',name);};
const browser=await chromium.launch();let member,robin;
async function issue(idx){
  const {walletId}=await json('POST',wallet+'/wallet',{});
  await json('POST',`${wallet}/wallet/${walletId}/keys/generate`,{backend:'jwk'});
  const offer=await json('POST',issuer+'/issuer2/credential-offers',{profileId:'communityMembership',authMethod:'PRE_AUTHORIZED',valueMode:'BY_VALUE',runtimeOverrides:{credentialStatus:{status_list:{idx,uri:status+'/status/lakeside/1'}}}});
  await json('POST',`${wallet}/wallet/${walletId}/credentials/receive`,{offerUrl:offer.credentialOffer});return walletId;
}
async function add(walletId,page){
  await page.goto(origin+'/identity/wallet');const requestUrl=await page.locator('#wallet-request').getAttribute('href');
  const result=await json('POST',`${wallet}/wallet/${walletId}/credentials/present`,{requestUrl});expect(result.transmission_success).toBe(true);
  const url=result.verifier_response.redirect_uri;expect(typeof url).toBe('string');
  await page.goto(url);await page.getByRole('button',{name:'Add membership',exact:true}).click();await page.waitForURL('**/identity/wallet');
  await expect(page.getByText('Lakeside Association · current',{exact:true})).toBeVisible();
}
async function setup(s,allow){
  const p=s.admin;
  await p.goto(s.origin+'/wp-admin/options-general.php?page=drop-identity');
  await p.getByLabel('Identity service address',{exact:true}).fill(config.issuer);await p.getByLabel('Client ID',{exact:true}).fill(s.id);
  await p.getByLabel('Client secret',{exact:true}).fill(secret);await p.getByLabel('Recognised organisation IDs').fill(org+'\n'+hosted);
  await p.getByRole('checkbox',{name:'Accept memberships checked from a wallet'}).setChecked(allow);
  await p.getByRole('button',{name:'Check and save connection',exact:true}).click();await expect(p.getByText('Settings saved.',{exact:true})).toBeVisible();
}
async function connect(s,{walletChoice=true,expectedWallet=true,name='Robin'}={}){
  await s.page.goto(s.origin+'/?unanym_share=1');
  await s.page.getByLabel('Your name on this website').fill(name);
  const box=s.page.getByRole('checkbox',{name:/Lakeside Association/});expect(await box.count()).toBe(expectedWallet?1:0);
  await s.page.getByRole('checkbox',{name:/Lakeside community/}).check();
  if(expectedWallet)await box.setChecked(walletChoice);
  await s.page.getByRole('button',{name:'Allow and continue',exact:true}).click();
  await expect(s.page.getByRole('heading',{name:'Welcome, '+name+(/[.!?…]$/.test(name)?'':'.'),exact:true})).toBeVisible();
}
async function pageAccess(s,allowed){
  const r=await s.page.goto(s.area);expect(r.status()).toBe(allowed?200:403);
  expect((await s.page.content()).includes(s.content)).toBe(allowed);
}
async function waitClosed(s,bound){
  const start=Date.now();
  while(Date.now()-start<=bound+1000){const r=await s.page.goto(s.area);if(r.status()===403){expect(await s.page.content()).not.toContain(s.content);return Date.now()-start;}expect(r.status()).toBe(200);await sleep(250);}
  throw Error('Protected page remained open beyond the stated bound');
}
try{
  for(let i=0;i<40;i++){try{if((await fetch(status+'/status/lakeside/1')).ok)break;}catch{}await sleep(250);}
  for(const s of sites){
    const inspect=JSON.parse(execFileSync('docker',['inspect',s.container],{encoding:'utf8'}))[0];
    expect(inspect.Config.Labels['life.frrn.drop.rehearsal']).toBe('wordpress');
    expect(inspect.Mounts.find(m=>m.Destination==='/var/www/html/wp-content/plugins/drop-identity').Source).toBe(resolve('integrations/wordpress/drop-identity'));
    // Each run creates a new fictional issuer key. Clear only these dedicated
    // labs' cached discovery/JWKS; real installations must preserve their keys.
    wp(s,'transient','delete','--all');
    wp(s,'eval',"delete_option('drop_identity_config');delete_option('openid_connect_generic_settings');delete_option('unanym_member_area');foreach(get_users(['role'=>'subscriber']) as $u){require_once ABSPATH.'wp-admin/includes/user.php';wp_delete_user($u->ID);}");
    s.content='FICTIONAL PRIVATE HANDBOOK '+s.id;
    s.pageId=Number(wp(s,'post','create','--post_type=page','--post_status=private','--post_title=Wallet member handbook','--post_content='+s.content,'--porcelain'));s.area=s.origin+'/?page_id='+s.pageId;
    s.admin=await browser.newPage();await s.admin.goto(s.origin+'/wp-login.php');await s.admin.getByLabel('Username or Email Address').fill('lab-admin');await s.admin.locator('#user_pass').fill('local-demo-only-2026');await s.admin.getByRole('button',{name:'Log In',exact:true}).click();await expect(s.admin.locator('#wpadminbar')).toBeVisible();
    await setup(s,s.allow);await s.admin.getByLabel('Members-only page',{exact:true}).selectOption(String(s.pageId));await s.admin.getByLabel('Required organisation membership',{exact:true}).selectOption(s.allow?org:hosted);await s.admin.getByRole('button',{name:'Save member area',exact:true}).click();
    expect(await (await fetch(s.area)).text()).not.toContain(s.content);
  }
  member=await browser.newContext();await member.addCookies([{name:'pl_session',value:f.login('robin'),url:origin}]);robin=await member.newPage();
  const first=await issue(5);await add(first,robin);pass('Real walt.id credential links only after same-browser confirmation.');
  for(const s of sites)s.page=await member.newPage();
  await connect(sites[0]);await connect(sites[1],{expectedWallet:false,name:'R.'});
  await pageAccess(sites[0],true);await pageAccess(sites[1],true);
  pass('Opted-in WordPress admits wallet membership; ordinary WordPress receives hosted membership only and still opens its page.');
  // Operator setting alone is insufficient; the website must request the extension too.
  config.clients[1].allow_wallet_memberships=true;
  await connect(sites[1],{expectedWallet:false,name:'R.'});await pageAccess(sites[1],true);
  config.clients[1].allow_wallet_memberships=false;await setup(sites[1],true);
  await connect(sites[1],{expectedWallet:false,name:'R.'});await pageAccess(sites[1],true);
  pass('Operator enablement and website request are both required; either alone leaves hosted access intact.');
  config.clients[1].allow_wallet_memberships=true;await connect(sites[1],{name:'R.'});
  await sites[1].admin.getByLabel('Members-only page',{exact:true}).selectOption(String(sites[1].pageId));
  await sites[1].admin.getByLabel('Required organisation membership',{exact:true}).selectOption(org);await sites[1].admin.getByRole('button',{name:'Save member area',exact:true}).click();
  await pageAccess(sites[0],true);await pageAccess(sites[1],true);
  const subject=s=>wp(s,'eval',"foreach(get_users(['role'=>'subscriber']) as $u)echo get_user_option('openid-connect-generic-subject-identity',$u->ID);");
  const before=sites.map(subject);expect(before[0]).not.toBe(before[1]);pass('Two real WordPress member pages accept separately consented identities with different subjects.');
  config.clients[0].allow_wallet_memberships=false;await pageAccess(sites[0],false);await pageAccess(sites[1],true);config.clients[0].allow_wallet_memberships=true;
  await pageAccess(sites[0],true);pass('Disabling operator capability removes wallet access on an existing session.');
  await connect(sites[0],{walletChoice:false});await pageAccess(sites[0],false);await pageAccess(sites[1],true);
  await connect(sites[0]);await pageAccess(sites[0],true);pass('Withdrawing wallet sharing closes only the selected website; ordinary sign-in remains.');
  await fetch(status+'/admin/revoke/5',{method:'POST'});measurements.withdrawal_to_page_denial_ms=await waitClosed(sites[0],5000);await pageAccess(sites[1],false);
  pass('Organisation revocation closes actual protected pages within 5 s refresh plus 1 s test tolerance.',measurements.withdrawal_to_page_denial_ms);
  const second=await issue(6);await add(second,robin);await pageAccess(sites[0],true);await pageAccess(sites[1],true);expect(sites.map(subject)).toEqual(before);
  pass('Replacing the credential and wallet key preserves both WordPress accounts.');
  await fetch(status+'/admin/outage/on',{method:'POST'});measurements.outage_to_page_denial_ms=await waitClosed(sites[0],20000);expect(measurements.outage_to_page_denial_ms).toBeLessThanOrEqual(21000);await pageAccess(sites[1],false);
  await sites[0].admin.goto(sites[0].origin+'/wp-admin/');await expect(sites[0].admin.locator('#wpadminbar')).toBeVisible();
  pass('Status outage closes actual member pages within 20 s plus 1 s test tolerance; native administrator access remains.',measurements.outage_to_page_denial_ms);
  await fetch(status+'/admin/outage/off',{method:'POST'});await bridge.refreshAll();await pageAccess(sites[0],true);
  // A valid unsupported wallet statement is ignored without discarding a valid hosted one.
  const key=await membershipKey(config.keys.drop),details={issuer:config.issuer,subject:'fixture-subject',audience:sites[1].id,organisation:{id:hosted,name:'Lakeside community'}};
  const normal=await issueMembership(config.keys.drop,{...details,approvedAt:'2026-09-01T00:00:00Z'}),fromWallet=await issueMembership(config.keys.drop,{...details,approvedAt:null,authorityMode:'wallet_verified'});
  const payload=Buffer.from(JSON.stringify({claim:{version:1,statements:[normal,fromWallet]},config:{issuer:config.issuer,client_id:sites[1].id,membership_key:key,organisations:[hosted],wallet_memberships:false}})).toString('base64');
  expect(wp(sites[1],'eval',`$x=json_decode(base64_decode('${payload}'),true);echo count(unanym_memberships($x['claim'],'fixture-subject',$x['config']));`)).toBe('1');
  pass('PHP ignores a valid unaccepted wallet statement while retaining unrelated hosted membership.');
  const sam=await browser.newContext();await sam.addCookies([{name:'pl_session',value:f.login('sam'),url:origin}]);const p=await sam.newPage();await p.goto(sites[0].origin+'/?unanym_share=1');await p.getByLabel('Your name on this website').fill('Sam');expect(await p.getByRole('checkbox').count()).toBe(0);await p.getByRole('button',{name:'Allow and continue'}).click();await expect(p.getByRole('heading',{name:'Welcome, Sam.',exact:true})).toBeVisible();
  expect((await p.goto(sites[0].area)).status()).toBe(403);pass('A member without a wallet signs in normally without gaining unapproved member access.');
  await robin.setViewportSize({width:375,height:812});await robin.goto(origin+'/identity/wallet');expect(await robin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await robin.screenshot({path:join(out,'wallet-mobile.png'),fullPage:true});
  writeFileSync(join(out,'wordpress.json'),JSON.stringify({date:new Date().toISOString(),classification:'Fictional loopback experiment with real walt.id v2 and two real WordPress pages; no human wallet use or HTTPS deployment',wordpress:wp(sites[0],'core','version'),checks,measurements},null,2));
} finally {
  for(const s of sites)if(s.pageId){wp(s,'eval',"delete_option('unanym_member_area');");wp(s,'post','delete',String(s.pageId),'--force');}
  await browser.close();await new Promise(r=>server.close(r));service.close();bridge.close();if(statusProcess.exitCode===null&&statusProcess.signalCode===null){statusProcess.kill();await once(statusProcess,'exit');}rmSync(dir,{recursive:true,force:true});
}
