import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {jwtVerify,createRemoteJWKSet,decodeJwt} from 'jose';
import {verifyMembership} from './community-contract.js';
import {displayName} from './presentation.js';

// A hosted receiving website for community-v1. It behaves like any other
// registered website: authorization code + S256 PKCE, ID-token and statement
// verification, current UserInfo. It stores nothing; each visit starts over.
// It is mounted only when the operator registers a client whose single
// redirect URI is this route, so no installation gains it silently.
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=buffer=>Buffer.from(buffer).toString('base64url');
export const exampleCallback=config=>config.origin+(config.basePath??'/identity')+'/example/callback';
export const exampleURL=config=>config.origin+(config.basePath??'/identity')+'/example/';

export function exampleClient(config) {
  if(config.contract!=='community-v1')return undefined;
  const callback=exampleCallback(config);
  return config.clients.find(c=>c.redirect_uris.length===1 && c.redirect_uris[0]===callback);
}

export function mountExample(app,config) {
  const client=exampleClient(config);
  if(!client)return false;
  const base=config.basePath??'/identity',path=base+'/example/',cookie='unanym_example';
  const secure=config.origin.startsWith('https:');
  const key=createHmac('sha256',config.keys.cookie).update('unanym-example-site').digest();
  const mac=value=>createHmac('sha256',key).update(value).digest('base64url');
  const timeout=()=>AbortSignal.timeout(10_000);
  const json=async(url,init)=>{
    const response=await fetch(url,{...init,signal:timeout()});
    if(!response.ok)throw Object.assign(new Error('Identity service request failed'),{name:'ExampleUpstreamError'});
    return response.json();
  };
  // Cache only successful lookups so a transient failure is retried.
  let discovery,jwks,statementKey;
  const discover=async()=>discovery??=await json(config.issuer+'/.well-known/openid-configuration');
  const keySet=async()=>jwks??=createRemoteJWKSet(new URL((await discover()).jwks_uri));
  const membershipKey=async()=>statementKey??=(await json(config.origin+base+'/membership-keys')).keys[0];

  const readState=req=>{
    const raw=String(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookie+'='));
    if(raw.length!==1)return null;
    const [payload,signature]=raw[0].slice(cookie.length+1).split('.');
    if(!payload||!signature)return null;
    const expected=Buffer.from(mac(payload)),actual=Buffer.from(signature);
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
    let state;
    try{state=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
    return state && state.expires>Date.now()?state:null;
  };
  const clearState=res=>res.clearCookie(cookie,{path,httpOnly:true,secure,sameSite:'lax'});

  app.get(base+'/example',(_req,res)=>res.redirect(path));
  app.get(path,(_req,res)=>res.send(welcome(config,client)));
  app.get(path+'start',async(req,res,next)=>{
    try{
      const d=await discover();
      const state={state:b64(randomBytes(32)),nonce:b64(randomBytes(32)),verifier:b64(randomBytes(32)),expires:Date.now()+600_000};
      const payload=b64(JSON.stringify(state));
      res.cookie(cookie,payload+'.'+mac(payload),{path,httpOnly:true,secure,sameSite:'lax',maxAge:600_000});
      const auth=new URL(d.authorization_endpoint);
      auth.search=new URLSearchParams({client_id:client.client_id,redirect_uri:exampleCallback(config),response_type:'code',
        scope:'openid profile identity.v1 memberships.v1',state:state.state,nonce:state.nonce,
        code_challenge:createHash('sha256').update(state.verifier).digest('base64url'),code_challenge_method:'S256',
        ...(req.query.change==='1'?{prompt:'consent'}:{})});
      res.redirect(auth.href);
    }catch(error){next(error);}
  });
  app.get(path+'callback',async(req,res,next)=>{
    const saved=readState(req);clearState(res);
    const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
    if(!saved||!same(req.query.state,saved.state))return res.status(400).send(notice(config,'This sign-in has expired.','Start again from the example website. Nothing was shared.'));
    if(req.query.iss!==undefined && req.query.iss!==config.issuer)return res.status(400).send(notice(config,'This sign-in could not be verified.','Start again from the example website.'));
    if(req.query.error)return res.send(notice(config,'You chose not to connect.','Nothing was shared with this example website.'));
    try{
      const d=await discover();
      const form={grant_type:'authorization_code',client_id:client.client_id,redirect_uri:exampleCallback(config),code:String(req.query.code??''),code_verifier:saved.verifier};
      const headers={};
      if(client.token_endpoint_auth_method==='client_secret_post')form.client_secret=client.client_secret;
      if(client.token_endpoint_auth_method==='client_secret_basic')headers.Authorization='Basic '+Buffer.from(encodeURIComponent(client.client_id)+':'+encodeURIComponent(client.client_secret)).toString('base64');
      const tokens=await json(d.token_endpoint,{method:'POST',headers,body:new URLSearchParams(form)});
      const {payload:id}=await jwtVerify(tokens.id_token,await keySet(),{issuer:config.issuer,audience:client.client_id});
      if(id.nonce!==saved.nonce)throw Object.assign(new Error('Nonce mismatch'),{name:'ExampleNonceError'});
      const claims=await json(d.userinfo_endpoint,{headers:{Authorization:'Bearer '+tokens.access_token}});
      if(claims.sub!==id.sub)throw Object.assign(new Error('Subject mismatch'),{name:'ExampleSubjectError'});
      const publicKey=await membershipKey();
      const memberships=await Promise.all((claims.memberships_v1?.statements??[]).map(async token=>{
        let decoded;try{decoded=decodeJwt(token);}catch{return {verified:false};}
        try{
          const proof=await verifyMembership(token,{signer:config.issuer,organisationId:decoded.organisation?.id,subject:claims.sub,audience:client.client_id,mode:'operator_attested',publicKey});
          return {verified:true,proof};
        }catch{return {verified:false,decoded};}
      }));
      res.send(result(config,client,{claims,memberships}));
    }catch(error){next(error);}
  });
  return true;
}

function shell(config,title,body) {
  const base=config.basePath??'/identity';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · Example website</title><link rel="stylesheet" href="${base}/assets/style.css"></head><body class="example-site">
  <a class="skip" href="#main">Skip to content</a><header><a class="brand" href="${base}/example/">Example website <span class="brand-sub">a demonstration receiving site</span></a></header>
  <main id="main">${body}</main><footer><span>Run by ${escape(config.operatorName)}. This example keeps no member profile. The identity service records your connection and sharing choices.</span></footer></body></html>`;
}

function welcome(config,client) {
  const base=config.basePath??'/identity',brand=escape(displayName(config));
  return shell(config,'Try a connection',`<section class="narrow"><p class="eyebrow">A website like any other</p><h1>See exactly what<br><em>a website receives.</em></h1>
  <p class="lead small">This example is registered with ${brand} the same way a community website is. Sign in, choose a name and any memberships to share, and this page shows what arrived.</p>
  <div class="actions"><a class="button" href="${base}/example/start">Continue with ${brand} →</a></div>
  <p class="help">You will see what is shared before you continue. Registered as “${escape(client.name)}”.</p>
  <p class="help">No memberships yet? You can still try choosing a name. Memberships appear only when an approved record is available to share. <a href="${base}/docs/members#if-no-memberships-appear">How memberships become available</a>.</p>
  <h2>What stays out</h2><p>Your email, your ${brand} account, memberships you do not tick, and the identifiers other websites know you by.</p></section>`);
}

function notice(config,title,text) {
  const base=config.basePath??'/identity';
  return shell(config,title,`<section class="narrow"><h1>${escape(title)}</h1><p class="lead small">${escape(text)}</p><div class="actions"><a class="button" href="${base}/example/">Back to the example</a></div></section>`);
}

function result(config,client,{claims,memberships}) {
  const base=config.basePath??'/identity',brand=escape(displayName(config));
  const date=value=>value?escape(value.slice(0,10)):'';
  const list=memberships.length?'<ul class="example-received">'+memberships.map(m=>m.verified
    ?`<li><strong>${escape(m.proof.organisation.name)}</strong><small>Approved ${date(m.proof.membership.approved_at)} · ${m.proof.membership.valid_until?'until '+date(m.proof.membership.valid_until):'no scheduled end'} · signed by the operator, signature valid</small></li>`
    :`<li><strong>${escape(m.decoded?.organisation?.name??'Unrecognised statement')}</strong><small>Not verified by this example. It checks operator-signed statements only.</small></li>`).join('')+'</ul>'
    :`<p>No memberships were shared. You chose none, or no approved membership is available yet. <a href="${base}/docs/members#if-no-memberships-appear">What to do next</a>.</p>`;
  const raw=JSON.stringify({...claims,memberships_v1:claims.memberships_v1&&{...claims.memberships_v1,statements:memberships.map(m=>m.proof??m.decoded??'unreadable')}},null,2);
  return shell(config,'What arrived',`<section class="narrow"><p class="eyebrow">Connected through ${brand}</p><h1>Hello, ${escape(claims.name)}.</h1>
  <p class="lead small">This is everything the example website received for this visit.</p>
  <article class="connection"><dl class="example-claims">
  <dt>Name you chose</dt><dd>${escape(claims.name)}</dd>
  <dt>Identifier for this website only</dt><dd><code>${escape(claims.sub)}</code></dd>
  <dt>Who holds your keys</dt><dd>${escape(claims.identity_v1?.operator?.name)} (the operator)</dd>
  <dt>Memberships you shared</dt><dd>${list}</dd></dl></article>
  <h2>What did not arrive</h2><p>Your email, your ${brand} account, memberships you did not tick, and your identifiers on other websites.</p>
  <h2>What a real website does next</h2><p>It applies its own rules. For example, a WordPress site opens its members-only page when you share a membership from an organisation it recognises.</p>
  <div class="actions"><a class="button" href="${base}/example/start?change=1">Change what I share</a><a class="button secondary" href="${base}/sites">See or disconnect this website</a></div>
  <details><summary>For developers: the decoded claims</summary><pre>${escape(raw)}</pre><p class="help">The ID token was verified against the published keys, the membership statements against the operator's statement key. This example trusts that key because the operator runs it; a real website pins the key at setup. Registered client: <code>${escape(client.client_id)}</code>.</p></details></section>`);
}
