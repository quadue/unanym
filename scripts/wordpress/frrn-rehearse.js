// Real FRRN forms -> read-only Unanym source -> real WordPress private page.
// Requires the FRRN community app checkout explicitly; never opens its runtime DB.
import {chromium,expect} from '@playwright/test';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createServer,request as httpRequest} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {configuration} from '../../src/config.js';
import {createFrrn} from '../../src/frrn/server.js';
const root=process.env.FRRN_APP_ROOT;
if(!root || !existsSync(resolve(root,'dist/server/entry.mjs')))throw new Error('Build FRRN and set FRRN_APP_ROOT to that checkout');
const load=file=>import(pathToFileURL(resolve(root,file)).href);
const {openDb}=await load('src/server/db.ts'),repo=await load('src/server/repo.ts'),{coCounselling}=await load('src/domain/presets.ts');
const lab='unanym-frrn',container=lab+'-wp',origin='http://localhost:4342',issuer='http://127.0.0.1:4340';
const wp=(...args)=>execFileSync('docker',['exec',container,'php','/usr/local/bin/wp-cli.phar','--allow-root',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
expect(execFileSync('docker',['inspect',container,'--format','{{index .Config.Labels "life.frrn.drop.rehearsal"}}'],{encoding:'utf8'}).trim()).toBe('wordpress');
const dir=mkdtempSync(join(tmpdir(),'frrn-wordpress-')),database=join(dir,'frrn.sqlite'),mode=join(dir,'mode');
writeFileSync(mode,'alpha\n');
const db=openDb(database),owner=repo.findOrCreateUser(db,'organiser@example.test'),member=repo.findOrCreateUser(db,'member@example.test');
const date=new Date().toISOString().slice(0,10),readiness={status:'ready',maintainer_name:'Fictional organiser',maintainer_contact:'mailto:organiser@example.test',privacy_contact:'mailto:privacy@example.test',reports_contact:'mailto:reports@example.test',complaints_contact:'mailto:complaints@example.test',admission_rule:'Organiser approval',training_rule:'No training claim in this rehearsal',terms_reviewed_on:date,privacy_reviewed_on:date,community_reviewed_on:date,report_reviewed_on:date,next_review_on:'2099-01-01'};
const {community}=repo.createCommunity(db,{slug:'practice-circle',name:'Example practice circle',createdBy:owner.id,displayName:'Alex',protocol:{...coCounselling,revision:1},readiness});
repo.saveCommunityAccess(db,community.id,owner.id,{visibility:'hidden',admission:'approval',requirements:'An organiser reviews requests.',show_meetings:0});
const invitation=repo.createInvite(db,community.id,owner.id);
const organisation={id:'urn:uuid:fictional-practice-association',name:'Example practice association'};
const sources=[{community_id:community.id,organisation,approvers:[{user_id:owner.id,authorisation_reference:'Fictional mandate for isolated automated acceptance only'}]}];
const secret=randomBytes(32).toString('base64url'),registry=join(dir,'clients.json'),secrets=join(dir,'secrets.json');
writeFileSync(registry,JSON.stringify([{client_id:'wordpress-pilot',name:'Example international website',description:'Fictional acceptance website',homepage:origin,redirect_uris:[origin+'/wp-admin/admin-ajax.php?action=openid-connect-authorize'],token_endpoint_auth_method:'client_secret_post',allow_refresh:true}]));
writeFileSync(secrets,JSON.stringify({'wordpress-pilot':secret}),{mode:0o600});
const basePath=process.env.IDENTITY_BASE_PATH??'/identity';
const config=configuration({IDENTITY_ORIGIN:issuer,IDENTITY_BASE_PATH:basePath,IDENTITY_CONTRACT:'community-v1',IDENTITY_OPERATOR_NAME:'Example service operator',IDENTITY_DATA_DIR:join(dir,'identity'),IDENTITY_CLIENTS:registry,IDENTITY_CLIENT_SECRETS:secrets});
const service=createFrrn(config,{path:database,modeFile:mode,sources});
const child=spawn(process.execPath,['dist/server/entry.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'4341',PACTLOOM_DB_PATH:database,PACTLOOM_RELEASE_MODE:'alpha',PACTLOOM_ALPHA_EMAILS:'organiser@example.test',PACTLOOM_DEV_LINKS:'1',PACTLOOM_DISABLE_WORKERS:'1',PACTLOOM_CODE_PEPPER:'synthetic-rehearsal-only',BREVO_API_KEY:'',MAIL_FROM:'',TURN_HOST:'',TURN_SHARED_SECRET:''},stdio:'ignore'});
const childExit=once(child,'exit');
// Same public origin as FRRN, matching the existing shared-session deployment.
const gateway=createServer((req,res)=>{
  if(req.url==='/identity'||req.url.startsWith('/identity/'))return service.app(req,res);
  const upstream=httpRequest({host:'127.0.0.1',port:4341,method:req.method,path:req.url,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Local app unavailable');});req.pipe(upstream);
});
gateway.listen(4340,'127.0.0.1');await once(gateway,'listening');
const browser=await chromium.launch(),evidence=[],output=resolve('data/unanym-frrn-wordpress-lab/evidence');mkdirSync(output,{recursive:true});
const pass=label=>{evidence.push(label);console.log('PASS',label);};
const signIn=async(page,email,next='/communities')=>{
 await page.goto(issuer+'/?next='+encodeURIComponent(next));await page.locator('#door-email').fill(email);
 await page.locator('form[action="/auth/request"] button[type="submit"]').click();await page.getByRole('link',{name:'Continue in local preview'}).click();await page.waitForURL(issuer+next);
};
const reconnect=async(page,share)=>{
 await page.goto(origin+'/wp-login.php');await page.getByRole('link',{name:'Continue with FRRN',exact:true}).click();
 await page.getByLabel('Your name on this website').fill('Robin');
 for(const checkbox of await page.getByRole('checkbox').all())await checkbox.setChecked(share);
 await page.getByRole('button',{name:'Allow and continue'}).click();await expect(page.getByRole('heading',{name:'Welcome, Robin.',exact:true})).toBeVisible();
};
let pageId;
try {
 for(let i=0;i<80;i++){try{if((await fetch(issuer)).ok)break;}catch{}await delay(100);}
 expect((await fetch(issuer)).ok).toBe(true);
 wp('transient','delete','--all');
 wp('eval',"delete_option('unanym_member_area');delete_option('drop_identity_config');delete_option('openid_connect_generic_settings');foreach(get_users(['role'=>'subscriber']) as $u){require_once ABSPATH.'wp-admin/includes/user.php';wp_delete_user($u->ID);}");
 const admin=await browser.newPage();await admin.goto(origin+'/wp-login.php');await admin.getByLabel('Username or Email Address').fill('lab-admin');await admin.locator('#user_pass').fill('local-demo-only-2026');await admin.getByRole('button',{name:'Log In',exact:true}).click();await expect(admin.locator('#wpadminbar')).toBeVisible();
 const marker='MEMBERS ONLY: The next practice exchange is being prepared by the organisers.';
 pageId=Number(wp('post','create','--post_type=page','--post_status=private','--post_title=Members handbook','--post_content='+marker,'--porcelain'));
 const otherId=Number(wp('post','create','--post_type=page','--post_status=private','--post_title=Other private page','--post_content=OTHER PRIVATE CONTENT','--porcelain'));
 await admin.goto(origin+'/wp-admin/options-general.php?page=drop-identity');
 await admin.getByLabel('Identity service address',{exact:true}).fill(config.issuer);await admin.getByLabel('Client ID',{exact:true}).fill('wordpress-pilot');await admin.getByLabel('Client secret',{exact:true}).fill(secret);await admin.getByLabel('Recognised organisation IDs').fill(organisation.id);await admin.getByRole('button',{name:'Check and save connection'}).click();await expect(admin.getByText('Settings saved.',{exact:true})).toBeVisible();
 await admin.getByLabel('Members-only page',{exact:true}).selectOption(String(pageId));await admin.getByLabel('Required organisation membership',{exact:true}).selectOption(organisation.id);await admin.getByRole('button',{name:'Save member area',exact:true}).click();await expect(admin.getByRole('link',{name:'Open member area',exact:true})).toBeVisible();
 const area=origin+'/?page_id='+pageId;
 pass('WordPress administrator connects the issuer, recognises an organisation and selects a private members page using forms.');
 const organiser=await browser.newPage();await signIn(organiser,'organiser@example.test','/c/practice-circle/manage');
 const context=await browser.newContext(),person=await context.newPage();await signIn(person,'member@example.test','/join/'+invitation);
 await person.locator('#display_name').fill('Robin in practice');for(const key of ['practice','availability','location'])await person.locator('[name="pf_'+key+'"]').fill('Fictional application');
 await person.locator('[name="requirements_accepted"]').check();await person.locator('[name="consent"]').check();await person.getByRole('button',{name:'Send request',exact:true}).click();await person.waitForURL('**/communities?requested=1');
 expect(db.prepare('SELECT COUNT(*) n FROM identity_memberships_v1').get().n).toBe(0);
 await reconnect(person,false);expect((await person.goto(area)).status()).toBe(403);expect(await person.content()).not.toContain(marker);
 pass('Pending FRRN application supplies no shareable membership; signing in alone cannot open the WordPress page.');
 await organiser.reload();await organiser.getByRole('button',{name:'Approve Robin in practice',exact:true}).click();await expect(organiser.getByText('Saved.',{exact:true})).toBeVisible();
 expect(db.prepare('SELECT COUNT(*) n FROM identity_memberships_v1').get().n).toBe(1);
 expect(existsSync(join(config.dir,'accounts.db'))).toBe(false);
 expect((await person.goto(area)).status()).toBe(403);
 await reconnect(person,true);await person.getByRole('link',{name:'Open member area',exact:true}).click();await expect(person.getByText(marker,{exact:true})).toBeVisible();
 expect((await person.goto(area)).status()).toBe(200);await person.screenshot({path:join(output,'member-page.png'),fullPage:true});
 const robin=JSON.parse(wp('user','list','--fields=ID,display_name,user_email,roles','--format=json')).find(u=>u.display_name==='Robin');expect(robin.user_email).toBe('');expect(robin.roles).toBe('subscriber');
 pass('One organiser approval in FRRN reaches Unanym only after member consent, and opens the actual WordPress page without another account/approval store.');
 expect((await person.goto(origin+'/?page_id='+otherId)).status()).toBe(404);expect(await person.content()).not.toContain('OTHER PRIVATE CONTENT');
 const anon=await browser.newPage();
 for(const path of ['/?page_id='+pageId,'/?rest_route=/wp/v2/pages/'+pageId,'/?s=MEMBERS+ONLY','/?feed=rss2','/?rest_route=/wp/v2/pages']) {
   const response=await anon.goto(origin+path);expect(await response.text()).not.toContain(marker);
 }
 pass('Membership grants no blanket private-page role; anonymous page, REST, search and feed responses withhold protected content.');
 wp('post','update',String(pageId),'--post_status=publish');expect(wp('post','get',String(pageId),'--field=post_status')).toBe('private');
 pass('A routine publish action cannot make the configured member page public.');
 await organiser.locator('#membership-approvals summary').click();await organiser.getByRole('button',{name:'Withdraw approval',exact:true}).click();await expect(organiser.getByText('Saved.',{exact:true})).toBeVisible();expect((await person.goto(area)).status()).toBe(403);expect(await person.content()).not.toContain(marker);
 await organiser.locator('#membership-approvals summary').click();await organiser.getByRole('button',{name:'Approve membership',exact:true}).click();await expect(organiser.getByText('Saved.',{exact:true})).toBeVisible();expect((await person.goto(area)).status()).toBe(200);
 pass('Withdrawing the FRRN approval closes WordPress access on the next request; explicit reapproval restores it.');
 await reconnect(person,false);expect((await person.goto(area)).status()).toBe(403);expect(db.prepare('SELECT COUNT(*) n FROM identity_memberships_v1').get().n).toBe(1);
 pass('The member can withhold membership while keeping their FRRN approval.');
 await reconnect(person,true);
 const share=await context.newPage();await share.goto(issuer+basePath+'/sites');await share.getByRole('button',{name:'Disconnect',exact:true}).click();await person.goto(area);await expect(person.getByText('Your FRRN connection ended.',{exact:false})).toBeVisible();
 pass('Disconnecting the site ends that WordPress identity session; native administrator access stays available.');
 await admin.goto(origin+'/wp-admin/');await expect(admin.locator('#wpadminbar')).toBeVisible();
 wp('plugin','deactivate','drop-identity');try{expect(await (await fetch(area)).text()).not.toContain(marker);}finally{wp('plugin','activate','drop-identity');}
 pass('Disabling the identity plugin leaves the actual WordPress page private.');
 writeFileSync(join(output,'frrn-rehearsal.json'),JSON.stringify({date:new Date().toISOString(),classification:'Isolated synthetic FRRN -> Unanym -> real WordPress rehearsal; no real mail, mandate or member acceptance',frrn_revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),frrn_dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),wordpress:wp('core','version'),generic:'3.11.3',contract:'community-v1',identity_base_path:basePath,checks:evidence},null,2));
} catch(error) {console.error(error.message.replace(/https?:\/\/\S+/g,'[URL withheld]'));process.exitCode=1;}
finally {await browser.close();await new Promise(r=>gateway.close(r));service.close();child.kill('SIGTERM');await childExit;db.close();rmSync(dir,{recursive:true,force:true});}
