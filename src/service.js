import {learnView} from './learn-view.js';
import express from 'express';
import Provider,{interactionPolicy} from 'oidc-provider';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore,adapterFor,connection,disconnect} from './store.js';
import {validateAccountAdapter} from './accounts.js';
import {persona,signerFrom,consentReceipt,membershipReceipt} from './drop.js';
import {page,consentView,sitesView,about,escape,rehearsalView} from './views.js';
import {issueMembership,membershipKey} from './community-contract.js';
import {standalonePage} from './standalone/views.js';
import {frontPage,developerPage,displayName,developerURL} from './presentation.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function createService(config,pact,{mountRoutes}={}) {
  validateAccountAdapter(pact);
  const standalone=config.contract==='community-v1';
  const membershipScope=standalone?'memberships.v1':'drop_memberships';
  const db=openStore(resolve(config.dir,'identity.db'));
  const encryption=Buffer.from(config.keys.encryption,'base64url');
  const issuerSigner=signerFrom(config.keys.drop);
  const registry=new Map(config.clients.map(c=>[c.client_id,c]));
  const policy=interactionPolicy.base();
  // An OIDC cookie alone cannot outlive or switch away from the Firn account.
  policy.get('login').checks.add(new interactionPolicy.Check('pact_session','Sign in through Firn','login_required',ctx=>{
    const account=pact.session(ctx.req);
    return !account || account.id!==ctx.oidc.session.accountId;
  }));
  policy.get('consent').checks.add(new interactionPolicy.Check('website_permission','Choose what this website may see','consent_required',ctx=>{
    const account=ctx.oidc.session.accountId;
    return !account || !connection(db,account,ctx.oidc.client.clientId)?.active;
  }));
  const provider=new Provider(config.issuer,{
    adapter:adapterFor(db),
    clients:config.clients.map(c=>({client_id:c.client_id,client_name:c.name,redirect_uris:c.redirect_uris,
      response_types:['code'],grant_types:c.allow_refresh?['authorization_code','refresh_token']:['authorization_code'],
      token_endpoint_auth_method:c.token_endpoint_auth_method??'none',client_secret:c.client_secret,subject_type:'pairwise'})),
    scopes:['openid','profile',...(standalone?['identity.v1','memberships.v1']:['drop_identity','drop_memberships']),...(config.clients.some(c=>c.allow_refresh)?['offline_access']:[])],
    clientAuthMethods:[...new Set(config.clients.map(c=>c.token_endpoint_auth_method??'none'))],
    jwks:{keys:[config.keys.oidc]},
    cookies:{keys:[config.keys.cookie],names:standalone?{session:'community_session',interaction:'community_interaction',resume:'community_resume'}:{session:'drop_session',interaction:'drop_interaction',resume:'drop_resume'},long:{httpOnly:true,sameSite:'lax'},short:{httpOnly:true,sameSite:'lax'}},
    claims:{openid:['sub'],profile:['name'],...(standalone?{'identity.v1':['identity_v1'],'memberships.v1':['memberships_v1']}:{drop_identity:['drop_identity'],drop_memberships:['drop_memberships','drop_membership_receipt']})},
    subjectTypes:['pairwise'],
    pairwiseIdentifier:async(ctx,id,client)=>(await persona(db,id,client.clientId,encryption)).subject,
    pkce:{required:()=>true},
    responseTypes:['code'],
    features:{devInteractions:{enabled:false},revocation:{enabled:true},rpInitiatedLogout:{enabled:false}},
    ttl:{AccessToken:300,AuthorizationCode:60,IdToken:300,Interaction:600,Session:1800,Grant:30*24*3600,
      RefreshToken:(_ctx,token)=>Math.max(1,7*24*3600-token.totalLifetime())},
    interactions:{policy,url:(_ctx,interaction)=>'/identity/interaction/'+interaction.uid},
    clientBasedCORS:(_ctx,origin,client)=>registry.get(client.clientId)?.redirect_uris.some(u=>new URL(u).origin===origin) ?? false,
    async findAccount(ctx,id) {
      if(!pact.account(id)) return undefined;
      return {accountId:id,async claims(){
        const clientId=ctx.oidc.client.clientId,consent=connection(db,id,clientId);
        if(!consent?.active) throw new Error('Website disconnected');
        const person=await persona(db,id,clientId,encryption);
        const shared=pact.memberships(id).filter(m=>consent.memberships.includes(m.slug));
        if(standalone)return {sub:id,name:consent.name,
          identity_v1:{version:1,public_key:person.signer.pub,custody:'operator',operator:{id:config.issuer,name:config.operatorName}},
          memberships_v1:{version:1,statements:await Promise.all(shared.map(m=>issueMembership(config.keys.drop,{
            issuer:config.issuer,subject:person.subject,audience:clientId,organisation:m.organisation,approvedAt:m.approvedAt,validUntil:m.validUntil
          })))}};
        return {sub:id,name:consent.name,
          drop_identity:{public_key:person.signer.pub,custody:'pact-hosted',format:'frrn-v2'},
          drop_memberships:shared.map(({slug,name})=>({slug,name,evidence:'current-pact-membership',training_verified:false})),
          drop_membership_receipt:await membershipReceipt(issuerSigner,{issuer:config.issuer,subject:person.subject,client:clientId,memberships:shared})};
      }};
    },
    async renderError(ctx) {ctx.type='html';ctx.body=page('Sign-in could not finish','<section class="narrow"><h1>Let’s start again.</h1><p>This sign-in request has expired or could not be verified. Return to the website and choose Continue with '+escape(displayName(config))+' again.</p><a class="button" href="/identity/">Back to your account</a></section>',config);}
  });
  provider.proxy=true;
  const app=express();
  const formOrigins=[...new Set(config.clients.flatMap(c=>c.redirect_uris.map(u=>new URL(u).origin)))].join(' ');
  app.disable('x-powered-by');
  app.enable('strict routing');
  app.set('trust proxy','loopback');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' ${formOrigins}; frame-ancestors 'none'`});
    next();
  });
  // Bound attempts without retaining IP addresses beyond the short window.
  const rates=new Map();
  app.use((req,res,next)=>{
    const k=req.socket.remoteAddress,at=Date.now();
    let entry=rates.get(k);if(!entry || entry.until<at){entry={until:at+60_000,count:0};rates.set(k,entry);}
    if(++entry.count>600) return res.status(429).send('Please wait a minute and try again.');
    if(rates.size>5000) for(const [key,value] of rates) if(value.until<at)rates.delete(key);
    next();
  });
  const body=express.urlencoded({extended:false,limit:'12kb'});
  const csrf=(req,action)=>createHmac('sha256',config.keys.cookie).update(pact.csrfBinding(req)+'\0'+action).digest('hex');
  function protect(req,res,next){
    const expected=csrf(req,req.path),actual=typeof req.body.csrf==='string'?req.body.csrf:'';
    if(req.headers.origin!==config.origin || actual.length!==expected.length || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return res.status(403).send('Please return to the page and try again.');
    next();
  }
  function account(req,res){
    const user=pact.session(req);
    if(!user) {
      const target=pact.loginURL(req.path);
      if(!target.startsWith('/') || target.startsWith('//') || target.includes('\\'))throw new Error('Account adapter must return a local login URL');
      res.redirect(target);
    }
    return user;
  }
  app.get('/identity',(_req,res)=>res.redirect('/identity/'));
  app.get('/identity/',(_req,res)=>res.send(frontPage(config,{home:'/identity/',signIn:standalone?'/identity/account':pact.loginURL('/identity/sites')})));
  app.get('/identity/about',(_req,res)=>res.send(standalone?standalonePage(config,'about'):about(config)));
  app.get('/identity/developers',(_req,res)=>res.send(developerPage(config)));
  app.get('/identity/wordpress',(_req,res)=>res.send(developerPage(config)));
  app.get('/identity/presentation',(_req,res)=>res.json({display_name:displayName(config),developer_url:developerURL(config)}));
  for(const [name,path] of [['standalone.md','docs/standalone.md'],['community-v1.md','docs/contracts/community-v1.md']])app.get('/identity/docs/'+name,(_req,res)=>res.type('text/plain').sendFile(resolve(ROOT,path)));
  app.get('/identity/learn',(_req,res)=>res.send(standalone?standalonePage(config,'home'):learnView(config)));
  // Local interaction review. The service name is Unanym; identifiers stay stable.
  if(config.demo)app.get('/identity/overview',(_req,res)=>res.send(frontPage(config,{home:'/identity/',signIn:standalone?'/identity/account':pact.loginURL('/identity/sites')})));
  if(!standalone)app.get('/identity/rehearsal',(_req,res)=>res.send(rehearsalView(config)));
  const evaluationDownload=(file,name)=>(_req,res)=>config.demo?res.download(resolve(ROOT,'dist/'+file),name):res.status(409).send('This legacy evaluation package is not released for new websites. Contact the operator about the versioned contract.');
  app.get('/identity/wordpress.zip',evaluationDownload('wordpress.zip','drop-identity-wordpress.zip'));
  app.get('/identity/health',(_req,res)=>res.json({service:standalone?'community-identity':'drop-identity',version:'0.2.0',contract:config.contract}));
  if(standalone)app.get('/identity/membership-keys',async(_req,res)=>res.set('Access-Control-Allow-Origin','*').json({issuer:config.issuer,keys:[await membershipKey(config.keys.drop)]}));
  app.get('/identity/keys',(_req,res)=>res.set('Access-Control-Allow-Origin','*').json({format:'frrn-v2',issuer:config.issuer,public_key:issuerSigner.pub}));
  app.use('/identity/assets',express.static(resolve(ROOT,'dist/assets'),{etag:true}));
  app.get('/identity/starter.zip',evaluationDownload('starter.zip','drop-identity-starter.zip'));
  if(!standalone)app.get('/identity/example/',(_req,res)=>res.send(readFileSync(resolve(ROOT,'dist/example/index.html'),'utf8')));
  app.get('/identity/example/client-config.json',(_req,res)=>res.json({authority:config.issuer,client_id:'developer-demo',site_name:'Example community',redirect_uri:config.origin+'/identity/example/'}));
  app.get('/identity/example/app.js',(_req,res)=>res.sendFile(resolve(ROOT,'dist/assets/client.js')));
  app.get('/identity/example/style.css',(_req,res)=>res.sendFile(resolve(ROOT,'dist/assets/style.css')));
  app.get('/identity/interaction/:uid',async(req,res)=>{
    const details=await provider.interactionDetails(req,res);
    const user=account(req,res);if(!user)return;
    if(details.prompt.name==='login') {
      await provider.interactionFinished(req,res,{login:{accountId:user.id}},{mergeWithLastSubmission:false});return;
    }
    if(details.session?.accountId!==user.id) return res.status(409).send('Your account changed. Start again from the website.');
    const client=registry.get(details.params.client_id);
    if(!client) return res.sendStatus(400);
    res.send(consentView({config,client,uid:details.uid,csrf:csrf(req,req.path+'/confirm'),memberships:pact.memberships(user.id),
      previous:connection(db,user.id,client.client_id),scopes:String(details.params.scope).split(' ')}));
  });
  app.post('/identity/interaction/:uid/confirm',body,protect,async(req,res)=>{
    const details=await provider.interactionDetails(req,res),user=account(req,res);if(!user)return;
    if(details.prompt.name!=='consent' || details.session?.accountId!==user.id) return res.sendStatus(409);
    const clientId=details.params.client_id;
    const name=typeof req.body.name==='string'?req.body.name.trim():'';
    if(!name || name.length>80 || /[\x00-\x1f\x7f]/.test(name)) return res.status(400).send('Enter a name of up to 80 characters.');
    const chosen=req.body.memberships===undefined?[]:Array.isArray(req.body.memberships)?req.body.memberships:[req.body.memberships];
    const available=pact.memberships(user.id);
    if(chosen.length>50 || chosen.some(x=>typeof x!=='string' || !available.some(m=>m.slug===x)) || (chosen.length && !String(details.params.scope).split(' ').includes(membershipScope))) return res.status(400).send('Choose only your current community memberships.');
    const memberships=[...new Set(chosen)];
    const person=await persona(db,user.id,clientId,encryption);
    await consentReceipt(db,person,{name,memberships,active:true},config);
    // Old access cannot retain an earlier broader set of permissions.
    disconnect(db,user.id,clientId,{keepInteraction:details.uid});
    const grant=new provider.Grant({accountId:user.id,clientId});
    grant.addOIDCScope(String(details.params.scope));
    if(details.prompt.details.missingOIDCClaims)grant.addOIDCClaims(details.prompt.details.missingOIDCClaims);
    const grantId=await grant.save();
    db.prepare('INSERT OR REPLACE INTO connections VALUES (?,?,?,?,?,?,?)').run(user.id,clientId,name,JSON.stringify(memberships),grantId,1,new Date().toISOString());
    await provider.interactionFinished(req,res,{consent:{grantId}},{mergeWithLastSubmission:true});
  });
  // The cancel button shares the confirmation CSRF token but never grants access.
  app.post('/identity/interaction/:uid/cancel',body,(req,res,next)=>{
    const old=req.url;req.url=req.url.replace(/\/cancel$/,'/confirm');
    protect(req,res,()=>{req.url=old;next();});
  },async(req,res)=>{
    if(!account(req,res))return;
    await provider.interactionDetails(req,res);
    await provider.interactionFinished(req,res,{error:'access_denied',error_description:'You chose not to connect this website.'},{mergeWithLastSubmission:false});
  });
  app.get('/identity/sites',(req,res)=>{
    const user=account(req,res);if(!user)return;
    const rows=db.prepare('SELECT client FROM connections WHERE account=? ORDER BY updated DESC').all(user.id)
      .map(({client})=>({...connection(db,user.id,client),site:registry.get(client)})).filter(x=>x.site);
    if(standalone){const current=pact.memberships(user.id);for(const row of rows)row.memberships=row.memberships.map(id=>current.find(m=>m.slug===id)?.name??'Membership no longer active');}
    res.send(sitesView(config,rows,id=>csrf(req,'/identity/sites/'+id+'/disconnect')));
  });
  app.post('/identity/sites/:client/disconnect',body,protect,async(req,res)=>{
    const user=account(req,res);if(!user)return;
    const row=connection(db,user.id,req.params.client);if(!row)return res.sendStatus(404);
    const person=await persona(db,user.id,row.client,encryption);
    await consentReceipt(db,person,{name:row.name,memberships:[],active:false},config);
    disconnect(db,user.id,row.client);res.redirect(303,'/identity/sites');
  });
  app.get('/identity/sites/:client/receipt',async(req,res)=>{
    const user=account(req,res);if(!user)return;
    const row=connection(db,user.id,req.params.client);if(!row)return res.sendStatus(404);
    const person=await persona(db,user.id,row.client,encryption);
    const events=db.prepare('SELECT event FROM receipts WHERE account=? AND client=? ORDER BY id').all(user.id,row.client).map(x=>JSON.parse(x.event));
    res.attachment('permission-'+row.client+'.json').json({format:'frrn-v2',custody:standalone?'operator':'pact-hosted',website:row.client,events:[person.identity,...events]});
  });
  mountRoutes?.(app);
  app.use('/identity/oidc',provider.callback());
  app.use((err,req,res,_next)=>{
    // Never log URLs, tokens, cookies, submitted names, or membership details.
    console.error('Identity request failed:',err.name);
    if(!res.headersSent)res.status(err.statusCode??500).send(page('Please try again','<section class="narrow"><h1>We could not finish that step.</h1><p>Return to the website and start the connection again. No extra information has been shared.</p><a class="button" href="/identity/">Back to identity</a></section>',config));
  });
  function cleanup(){
    db.prepare('DELETE FROM oidc WHERE expires IS NOT NULL AND expires<?').run(Math.floor(Date.now()/1000));
    // A closed Firn is not evidence of account deletion. Read existence separately.
    if(pact.isOpen && !pact.isOpen())return;
    for(const {account:id} of db.prepare('SELECT DISTINCT account FROM personas').all()) if(!pact.account(id)) {
      db.transaction(()=>{
        for(const table of ['personas','connections','receipts'])db.prepare('DELETE FROM '+table+' WHERE account=?').run(id);
        db.prepare("DELETE FROM oidc WHERE json_extract(payload,'$.accountId')=?").run(id);
      })();
    }
  }
  const timer=setInterval(cleanup,3600_000);timer.unref();cleanup();
  return {app,provider,db,cleanup,close(){clearInterval(timer);db.close();pact.close?.();}};
}
