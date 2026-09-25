import {identityPort,identityOrigin} from './demo-addresses.js';
import express from 'express';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {configuration} from '../src/config.js';
import {createService} from '../src/service.js';
import {page} from '../src/views.js';
import {independentFixture} from './independent-fixture.js';

// Fictional loopback demonstration of the community-v1 contract with the hosted
// example website. Not a production login system; no email is sent.
process.umask(0o077);
const dir=resolve(process.env.UNANYM_DEMO_DATA_DIR??resolve('data','demo-v1'));mkdirSync(dir,{recursive:true});
writeFileSync(resolve(dir,'clients.json'),JSON.stringify([{client_id:'example',name:'Example website',
  description:'A demonstration website. It shows what it receives and keeps nothing after you leave the page.',
  homepage:identityOrigin+'/identity/example/',sharing_uri:identityOrigin+'/identity/example/start?change=1',redirect_uris:[identityOrigin+'/identity/example/callback']}]));
const f=independentFixture({v1:true});
const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:identityOrigin,IDENTITY_OPERATOR_NAME:'Local demonstration operator',
  IDENTITY_DATA_DIR:resolve(dir,'identity'),IDENTITY_CLIENTS:resolve(dir,'clients.json'),IDENTITY_DEMO:'1',IDENTITY_DISPLAY_NAME:process.env.IDENTITY_DISPLAY_NAME});
const service=createService(config,f.adapter,{mountRoutes:app=>app.get('/identity/account',(_req,res)=>res.redirect('/identity/sites'))});
service.app.get('/',(req,res)=>{
  if(!req.query.next)return res.redirect('/identity/developers');
  const next=typeof req.query.next==='string' && req.query.next.startsWith('/identity/')?req.query.next:'/identity/';
  const safe=next.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  res.send(page('Local demo sign-in',`<section class="narrow"><h1>Try a fictional account.</h1><p>This local demonstration uses fictional accounts. Robin has two approved memberships; Sam has none. No emails are sent.</p><form method="post" action="/demo/login"><input type="hidden" name="next" value="${safe}"><div class="actions"><button name="account" value="robin">Continue as Robin</button><button class="secondary" name="account" value="sam">Continue as Sam</button></div></form></section>`,config));
});
service.app.post('/demo/login',express.urlencoded({extended:false}),(req,res)=>{
  if(req.headers.origin!==config.origin)return res.sendStatus(403);
  res.cookie('pl_session',f.login(req.body.account),{httpOnly:true,sameSite:'lax',path:'/'});
  const next=typeof req.body.next==='string' && req.body.next.startsWith('/identity/')?req.body.next:'/identity/';
  res.redirect(303,next);
});
const server=service.app.listen(identityPort,'127.0.0.1');
console.log(`Unanym community-v1 demo: ${identityOrigin}/identity/example/ — developer overview: ${identityOrigin}/identity/developers`);
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.close();service.close();f.close();process.exit(0);});
