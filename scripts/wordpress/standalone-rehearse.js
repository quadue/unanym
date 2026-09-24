// Isolated real-WordPress acceptance. Codes are captured only inside this test process.
import {chromium,expect} from '@playwright/test';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {configuration} from '../../src/config.js';
import {createStandalone} from '../../src/standalone/server.js';
const lab=process.env.UNANYM_LAB_NAME??'unanym-standalone';
if(!['unanym-standalone','frrn-frontpage','unanym-frrn'].includes(lab))throw new Error('Use a dedicated standalone lab');
const origin='http://localhost:'+(process.env.UNANYM_WP_PORT??4302),issuer='http://127.0.0.1:'+(process.env.UNANYM_ISSUER_PORT??4300),container=lab+'-wp';
const brand=process.env.IDENTITY_DISPLAY_NAME??'FRRN';
const wp=(...args)=>execFileSync('docker',['exec',container,'php','/usr/local/bin/wp-cli.phar','--allow-root',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dir=mkdtempSync(join(tmpdir(),'unanym-wordpress-')),mail=new Map(),secret=randomBytes(32).toString('base64url');
const registry=join(dir,'clients.json'),secrets=join(dir,'secrets.json');
writeFileSync(registry,JSON.stringify([{client_id:'wordpress-pilot',name:'Lakeside community',description:'Fictional WordPress acceptance fixture',homepage:origin,redirect_uris:[origin+'/wp-admin/admin-ajax.php?action=openid-connect-authorize'],token_endpoint_auth_method:'client_secret_post',allow_refresh:true}]));
writeFileSync(secrets,JSON.stringify({'wordpress-pilot':secret}),{mode:0o600});
const config=configuration({IDENTITY_ORIGIN:issuer,IDENTITY_CONTRACT:'community-v1',IDENTITY_OPERATOR_NAME:'Lakeside test operator',IDENTITY_DISPLAY_NAME:brand,IDENTITY_DATA_DIR:dir,IDENTITY_CLIENTS:registry,IDENTITY_CLIENT_SECRETS:secrets});
const service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.set(m.email,m.code)});
const server=service.app.listen(Number(new URL(issuer).port),'127.0.0.1');
const evidence=[],output=resolve('data/'+lab+'-wordpress-lab/evidence');mkdirSync(output,{recursive:true});
const pass=label=>{evidence.push(label);console.log('PASS',label);};
const browser=await chromium.launch();
const nativeLogin=async(page,user,password)=>{await page.goto(origin+'/wp-login.php');await page.getByLabel('Username or Email Address').fill(user);await page.locator('#user_pass').fill(password);await page.getByRole('button',{name:'Log In',exact:true}).click();await expect(page.locator('#wpadminbar')).toBeVisible();};
const codeLogin=async(page,email)=>{
 await page.getByLabel('Email address').fill(email);await page.getByRole('button',{name:'Send code',exact:true}).click();await page.getByLabel('Sign-in code').fill(mail.get(email));await page.getByRole('button',{name:'Sign in',exact:true}).click();
};
const identityLogin=async(page,email)=>{await page.goto(issuer+'/identity/login');await codeLogin(page,email);await page.waitForURL('**/identity/account');};
const consent=async(page,name,share=false)=>{
 await page.getByLabel('Your name on this website').fill(name);for(const box of await page.getByRole('checkbox').all())await box.setChecked(share);await page.getByRole('button',{name:'Allow and continue'}).click();await expect(page.getByRole('heading',{name:'Welcome, '+name+'.',exact:true})).toBeVisible();
};
try{
 // This dedicated lab may be rerun without touching another WordPress container.
 expect(execFileSync('docker',['inspect',container,'--format','{{index .Config.Labels "life.frrn.drop.rehearsal"}}'],{encoding:'utf8'}).trim()).toBe('wordpress');
 wp('transient','delete','--all');
 wp('eval',"delete_option('drop_identity_config');delete_option('openid_connect_generic_settings');delete_option('unanym_member_area');foreach(get_users(['role'=>'subscriber']) as $u){require_once ABSPATH.'wp-admin/includes/user.php';wp_delete_user($u->ID);}");
 const operator=await browser.newPage();await identityLogin(operator,'operator@example.test');await operator.getByRole('link',{name:'Register an organisation',exact:true}).click();
 await operator.getByLabel('Organisation name').fill('Lakeside circle');await operator.getByLabel('Administrator email').fill('organiser@example.test');await operator.getByLabel('Authorisation reference').fill('Fictional appointment for this automated rehearsal');await operator.getByRole('button',{name:'Register organisation',exact:true}).click();await operator.waitForURL('**/identity/account');
 const organiser=await browser.newPage();await identityLogin(organiser,'organiser@example.test');await organiser.getByRole('link',{name:'Lakeside circle',exact:true}).click();await organiser.getByLabel('Member email').fill('member@example.test');await organiser.getByRole('button',{name:'Approve membership',exact:true}).click();await organiser.getByText('member@example.test',{exact:true}).waitFor();
 const org=service.accounts.db.prepare('SELECT id FROM organisations').get().id;
 await organiser.screenshot({path:join(output,'organisation.png'),fullPage:true});
 pass('A separately signed-in organisation admin approves the fictional member through the form.');
 const a=await browser.newPage();await nativeLogin(a,'lab-admin','local-demo-only-2026');await a.goto(origin+'/wp-admin/options-general.php?page=drop-identity');
 await a.getByLabel('Identity service address',{exact:true}).fill(config.issuer);await a.getByLabel('Client ID',{exact:true}).fill('wordpress-pilot');await a.getByLabel('Client secret',{exact:true}).fill(secret);await a.getByLabel('Recognised organisation IDs').fill(org);await a.getByRole('button',{name:'Check and save connection'}).click();await expect(a.getByText('Settings saved.',{exact:true})).toBeVisible();
 expect(wp('eval',"echo get_option('openid_connect_generic_settings')['scope'];")).toBe('openid profile identity.v1 memberships.v1 offline_access');
 // A synthetic server-side access decision exercises the public plugin helper.
 // It is not a generic page-protection feature or a production integration.
 const fixture=`<?php add_action('template_redirect',function(){if(!isset($_GET['unanym_probe']))return;nocache_headers();if(!unanym_has_membership('${org}')){status_header(403);echo 'Membership required';}else{echo 'Membership accepted';}exit;});`;
 wp('eval',"wp_mkdir_p(WPMU_PLUGIN_DIR);file_put_contents(WPMU_PLUGIN_DIR.'/unanym-test-probe.php',base64_decode('"+Buffer.from(fixture).toString('base64')+"'));");
 expect(wp('eval',"echo get_option('openid_connect_generic_settings')['login_button_text'];")).toBe('Continue with '+brand);
 pass('Real WordPress setup selects v1 scopes, pins the operator key, recognises the organisation and uses the host name for member sign-in.');
 const member=await browser.newContext();const p=await member.newPage();await p.goto(origin+'/wp-login.php');await p.getByRole('link',{name:'Continue with '+brand,exact:true}).click();await codeLogin(p,'member@example.test');
 await p.getByLabel('Your name on this website').fill('Robin');await p.getByRole('checkbox').check();await p.screenshot({path:join(output,'consent.png'),fullPage:true});await consent(p,'Robin',true);
 const users=JSON.parse(wp('user','list','--fields=ID,user_login,user_email,display_name,roles','--format=json')),robin=users.find(u=>u.display_name==='Robin');expect(robin.user_email).toBe('');expect(robin.roles).toBe('subscriber');
 expect((await p.goto(origin+'/?unanym_probe=1')).status()).toBe(200);await expect(p.getByText('Membership accepted',{exact:true})).toBeVisible();
 pass('Email-code login creates a Subscriber without shared email; PHP verifies and accepts the selected organisation membership.');
 await organiser.getByRole('button',{name:'Revoke membership'}).click();expect((await p.goto(origin+'/?unanym_probe=1')).status()).toBe(403);await p.goto(origin+'/wp-admin/profile.php');await expect(p.locator('#wpadminbar')).toBeVisible();
 await organiser.getByLabel('Member email').fill('member@example.test');await organiser.getByRole('button',{name:'Approve membership',exact:true}).click();await organiser.getByRole('button',{name:'Revoke membership'}).waitFor();expect((await p.goto(origin+'/?unanym_probe=1')).status()).toBe(200);
 pass('Revocation removes membership access on the next request without deleting the WordPress account; reapproval restores current evidence.');
 wp('eval',`$sessions=get_user_meta(${Number(robin.ID)},'session_tokens',true);foreach($sessions as &$s){if(isset($s['drop_identity']))$s['drop_identity']['expires']=0;}unset($s);update_user_meta(${Number(robin.ID)},'session_tokens',$sessions);`);
 expect((await p.goto(origin+'/?unanym_probe=1')).status()).toBe(200);pass('WordPress renews the v1 server-side session without another member login.');
 // Reconnect while retaining the shared login, withholding the membership this time.
 await p.goto(origin+'/wp-login.php');await p.getByRole('link',{name:'Continue with '+brand,exact:true}).click();await consent(p,'Robin',false);expect((await p.goto(origin+'/?unanym_probe=1')).status()).toBe(403);pass('Withholding membership removes access even though organisation approval remains active.');
 wp('eval',"wp_insert_user(['user_login'=>'existing-member','user_pass'=>'local-member-only-2026','display_name'=>'Existing','user_email'=>'existing@example.invalid','role'=>'subscriber']);");
 const count=Number(wp('user','list','--format=count')),oldID=wp('user','get','existing-member','--field=ID');
 const e=await browser.newPage();await nativeLogin(e,'existing-member','local-member-only-2026');await e.goto(origin+'/wp-admin/profile.php');await e.getByRole('link',{name:'Connect this account to '+brand,exact:true}).click();await codeLogin(e,'existing@example.test');await consent(e,'Alex');
 expect(Number(wp('user','list','--format=count'))).toBe(count);expect(wp('user','get',oldID,'--field=user_email')).toBe('existing@example.invalid');pass('Explicit linking preserves the existing WordPress account and email without creating a duplicate.');
 const userinfo=wp('eval',"echo get_option('drop_identity_config')['userinfo_endpoint'];");
 wp('eval',"$c=get_option('drop_identity_config');$c['userinfo_endpoint']='http://127.0.0.1:1/unavailable';update_option('drop_identity_config',$c);");
 try{expect((await p.goto(origin+'/wp-admin/profile.php')).status()).toBe(503);await a.goto(origin+'/wp-admin/');await expect(a.locator('#wpadminbar')).toBeVisible();}
 finally{wp('eval',"$c=get_option('drop_identity_config');$c['userinfo_endpoint']="+JSON.stringify(userinfo)+";update_option('drop_identity_config',$c);");}
 await p.goto(origin+'/wp-admin/profile.php');await expect(p.locator('#wpadminbar')).toBeVisible();pass('Issuer outage blocks connected access, preserves native admin login, and recovers.');
 const sessions=JSON.parse(wp('user','meta','get',String(robin.ID),'session_tokens','--format=json'));const refresh=Object.values(sessions).find(s=>s.drop_identity)?.drop_identity.refresh;
 const manage=await member.newPage();await manage.goto(issuer+'/identity/sites');await manage.getByRole('button',{name:'Disconnect',exact:true}).click();await p.goto(origin+'/wp-admin/profile.php');await expect(p.getByText('Your '+brand+' connection ended.',{exact:false})).toBeVisible();await e.goto(origin+'/wp-admin/profile.php');await expect(e.locator('#wpadminbar')).toBeVisible();
 expect((await fetch(config.issuer+'/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:'wordpress-pilot',client_secret:secret})})).status).toBe(400);pass('Disconnect ends only that connection and revokes its refresh token.');
 const starter=await browser.newPage();await starter.goto(origin+'/wp-login.php');const start=await starter.getByRole('link',{name:'Continue with '+brand,exact:true}).getAttribute('href');
 const outsider=await browser.newPage();await outsider.goto(origin+'/wp-login.php');await outsider.goto(start);await codeLogin(outsider,'outsider@example.test');await outsider.getByLabel('Your name on this website').fill('Other');await outsider.getByRole('button',{name:'Allow and continue'}).click();await expect(outsider.getByText('This sign-in started in a different browser or expired.',{exact:false})).toBeVisible();pass('A sign-in URL copied to another browser cannot create a WordPress session.');
 await manage.setViewportSize({width:375,height:812});await manage.goto(issuer+'/identity/account');expect(await manage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await manage.screenshot({path:join(output,'account-mobile.png'),fullPage:true});pass('Account page fits a 375px viewport.');
 writeFileSync(join(output,'rehearsal.json'),JSON.stringify({date:new Date().toISOString(),classification:'Automated fictional standalone WordPress rehearsal; captured mail, no real delivery or human usability evidence',wordpress:wp('core','version'),generic:'3.11.3',contract:'community-v1',memberBrand:brand,checks:evidence},null,2));
}catch(error){console.error(error.message.replace(/https?:\/\/\S+/g,'[URL withheld]'));process.exitCode=1;}
finally{wp('eval',"@unlink(WPMU_PLUGIN_DIR.'/unanym-test-probe.php');");await browser.close();await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});}
