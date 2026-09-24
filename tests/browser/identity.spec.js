import {test,expect} from '@playwright/test';
import {identityOrigin as origin,siteOrigin} from '../../scripts/demo-addresses.js';
const site=siteOrigin+'/';
test('identity home redirects once and renders',async({page,request})=>{
 const response=await request.get(origin+'/identity',{maxRedirects:0});
 expect(response.status()).toBe(302);expect(response.headers().location).toBe('/identity/');
 const home=await page.goto(origin+'/identity/');expect(home.status()).toBe(200);
 await expect(page.locator('h1')).toBeVisible();
});
async function connect(page,{name='Robin',membership=false}={}){
 await page.goto(site);await page.getByRole('button',{name:'Continue with FRRN'}).click();
 await page.getByRole('button',{name:'Continue as Robin'}).click();
 await expect(page.getByRole('heading',{name:'Lakeside website',exact:true})).toBeVisible();
 await page.getByLabel('Your name on this website').fill(name);
 const boxes=page.getByRole('checkbox');for(let i=0;i<await boxes.count();i++)await boxes.nth(i).uncheck();
 if(membership)await page.getByRole('checkbox',{name:'Lakeside community'}).check();
 await expect(page.locator('#consent-preview-name')).toHaveText(name);
 if(membership){
   await expect(page.locator('#consent-preview-memberships')).toContainText('Lakeside community');
   await expect(page.locator('#consent-preview-memberships')).not.toContainText('Private');
 }
 await page.getByRole('button',{name:'Allow and continue'}).click();
 await expect(page.locator('#signed-in')).toBeVisible();
}
test('real OIDC roundtrip: selective disclosure, signed proof, disconnect and denied re-use',async({page,context})=>{
 await connect(page,{membership:true});
 await expect(page.locator('#memberships')).toContainText('Lakeside');
 await expect(page.locator('#memberships')).not.toContainText('Private');
 await expect(page.locator('#received')).not.toContainText('@example');
 const management=await context.newPage();await management.goto(origin+'/identity/sites');
 await management.getByRole('button',{name:'Disconnect'}).first().click();
 await page.getByRole('button',{name:'Check access now'}).click();
 await expect(page.locator('#signed-out')).toBeVisible();await expect(page.locator('#status')).toContainText('no longer available');
});
test('declining shares nothing and requires no name',async({page})=>{
 await page.goto(site);await page.getByRole('button',{name:'Continue with FRRN'}).click();await page.getByRole('button',{name:'Continue as Robin'}).click();
 await page.getByRole('button',{name:'Not now'}).click();await expect(page).toHaveURL(site);await expect(page.locator('#signed-out')).toBeVisible();
});
test('same account receives a different subject on another website, no memberships by default',async({page})=>{
 await connect(page,{name:'River'});await expect(page.locator('#no-memberships')).toBeVisible();
 const first=JSON.parse(await page.locator('#received').textContent());
 await page.goto(origin+'/identity/example/');await page.getByRole('button',{name:'Continue with FRRN'}).click();
 await page.getByLabel('Your name on this website').fill('R');await page.getByRole('button',{name:'Allow and continue'}).click();
 await expect(page.locator('#signed-in')).toBeVisible();
 const second=JSON.parse(await page.locator('#received').textContent());expect(second.subject).not.toBe(first.subject);expect(second.identity.public_key).not.toBe(first.identity.public_key);
});
test('unknown redirect and missing PKCE are rejected',async({request})=>{
 const query=new URLSearchParams({client_id:'sample-community',response_type:'code',scope:'openid',redirect_uri:'https://attacker.example/callback',state:'test'});
 let r=await request.get(origin+'/identity/oidc/auth?'+query,{maxRedirects:0});expect(r.status()).toBe(400);expect(r.headers().location).toBeUndefined();
 query.set('redirect_uri',site);r=await request.get(origin+'/identity/oidc/auth?'+query,{maxRedirects:0});
 expect([303,302,400]).toContain(r.status());if(r.headers().location)expect(r.headers().location).toContain('error=invalid_request');
});
test('cross-origin consent POST and forged membership fail',async({page,request})=>{
 await page.goto(site);await page.getByRole('button',{name:'Continue with FRRN'}).click();await page.getByRole('button',{name:'Continue as Robin'}).click();
 const form=await page.locator('form').first().getAttribute('action');
 let r=await request.post(origin+form,{form:{name:'Attacker',csrf:'forged'},headers:{Origin:'https://attacker.example'}});expect(r.status()).toBe(403);
 await page.getByLabel('Your name on this website').fill('Robin');
 await page.locator('input[name=memberships]').first().evaluate(el=>{el.value='unknown-community';el.checked=true;});
 await page.getByRole('button',{name:'Allow and continue'}).click();await expect(page.locator('body')).toContainText('Choose only your current');
});
test('mobile consent is readable without horizontal scrolling',async({page})=>{
 await page.setViewportSize({width:375,height:812});await page.goto(site);await page.getByRole('button',{name:'Continue with FRRN'}).click();await page.getByRole('button',{name:'Continue as Robin'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Your name on this website').fill('Mobile member');await page.getByRole('button',{name:'Allow and continue'}).click();await expect(page.locator('#signed-in')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('public-only discovery advertises exactly the available grants and authentication',async({request})=>{
 const r=await request.get(origin+'/identity/oidc/.well-known/openid-configuration');const d=await r.json();
 expect(d.grant_types_supported).toEqual(['authorization_code']);expect(d.token_endpoint_auth_methods_supported).toEqual(['none']);
 expect(d.scopes_supported).not.toContain('offline_access');expect(d.end_session_endpoint).toBeUndefined();
});
