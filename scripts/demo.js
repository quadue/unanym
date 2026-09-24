import {identityPort,sitePort,identityOrigin,siteOrigin} from './demo-addresses.js';
import express from 'express';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {configuration} from '../src/config.js';
import {createService} from '../src/service.js';
import {page} from '../src/views.js';
import {frontPage} from '../src/presentation.js';
import {mountStaticStarter} from './static-starter-fixture.js';
process.umask(0o077);
const source=process.env.UNANYM_DEMO_ACCOUNT_SOURCE??'firn';
if(!['firn','independent'].includes(source))throw new Error('Unknown demo account source');
const dir=resolve(process.env.UNANYM_DEMO_DATA_DIR??resolve('data',source==='independent'?'demo-independent':'demo'));mkdirSync(dir,{recursive:true});
const clients=[{client_id:'sample-community',name:'Lakeside website',description:'A fictional local community website.',homepage:siteOrigin+'/',redirect_uris:[siteOrigin+'/',siteOrigin+'/community-login/']},
{client_id:'developer-demo',name:'Example community',description:'Another website, with its own identity.',homepage:identityOrigin+'/identity/example/',redirect_uris:[identityOrigin+'/identity/example/']}];
writeFileSync(resolve(dir,'clients.json'),JSON.stringify(clients));
let f,adapter;
if(source==='independent'){
  const {independentFixture}=await import('./independent-fixture.js');
  f=independentFixture();adapter=f.adapter;
}else{
  const {fixture}=await import('./fixture.js');
  const {pactAdapter}=await import('../src/pact.js');
  f=fixture(dir);adapter=pactAdapter({path:f.path,modeFile:f.mode});
}
const config=configuration({IDENTITY_ORIGIN:identityOrigin,IDENTITY_DATA_DIR:resolve(dir,'identity'),IDENTITY_CLIENTS:resolve(dir,'clients.json'),IDENTITY_DEMO:'1',IDENTITY_DISPLAY_NAME:process.env.IDENTITY_DISPLAY_NAME,IDENTITY_DEVELOPER_URL:process.env.IDENTITY_DEVELOPER_URL});
const service=createService(config,adapter);
service.app.get('/',(req,res)=>{
  if(!req.query.next)return res.send(frontPage(config,{signIn:'/?next=/identity/sites'}));
  const next=typeof req.query.next==='string' && req.query.next.startsWith('/identity/')?req.query.next:'/identity/';
  const safe=next.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  res.send(page('Local demo sign-in',`<section class="narrow"><h1>Try a fictional account.</h1><p>${source==='independent'?'This independent account adapter uses no Firn database.':'This local fixture stands in for Firn’s hosted sign-in.'} No emails are sent. These buttons are for local testing only.</p><form method="post" action="/demo/login"><input type="hidden" name="next" value="${safe}"><div class="actions"><button name="account" value="robin">Continue as Robin</button><button class="secondary" name="account" value="sam">Continue as Sam</button></div></form></section>`,config));
});
service.app.post('/demo/login',express.urlencoded({extended:false}),(req,res)=>{
  if(req.headers.origin!==config.origin)return res.sendStatus(403);
  res.cookie('pl_session',f.login(req.body.account),{httpOnly:true,sameSite:'lax',path:'/'});
  const next=typeof req.body.next==='string' && req.body.next.startsWith('/identity/')?req.body.next:'/identity/';
  res.redirect(303,next);
});
const site=express();
mountStaticStarter(site,{issuer:config.issuer,siteOrigin});
site.get('/client-config.json',(_req,res)=>res.json({authority:config.issuer,client_id:'sample-community',site_name:'Lakeside website',redirect_uri:siteOrigin+'/'}));
site.get('/app.js',(_req,res)=>res.sendFile(resolve('dist/assets/client.js')));
site.get('/style.css',(_req,res)=>res.sendFile(resolve('web/style.css')));
site.use(express.static(resolve('examples/community')));
const servers=[service.app.listen(identityPort,'127.0.0.1'),site.listen(sitePort,'127.0.0.1')];
console.log(`Unanym demo (${source} account adapter): ${identityOrigin}/identity/ — first integration: ${siteOrigin}/`);
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{servers.forEach(s=>s.close());service.close();f.db?.close();f.close?.();process.exit(0);});
