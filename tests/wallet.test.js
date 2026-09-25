import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {SignJWT,importJWK} from 'jose';
import {verifyPresentation} from '../src/wallet/sd-jwt.js';
import {signStatusList,verifyStatusList,readStatus,encodeStatusList} from '../src/wallet/status-list.js';
import {createWalletBridge} from '../src/wallet/bridge.js';
import {issueMembership,verifyMembership,membershipKey} from '../src/community-contract.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';

const jwk=()=>{const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});return {priv:privateKey.export({format:'jwk'}),pub:publicKey.export({format:'jwk'})};};
const b64=value=>Buffer.from(value).toString('base64url');
const digest=text=>createHash('sha256').update(text).digest('base64url');
const issuer=jwk(),holder=jwk(),stranger=jwk();
const trust=[{issuer:'https://issuer.example',publicJwk:issuer.pub,alg:'ES256',vct:'https://issuer.example/membership',organisationId:'urn:example:lakeside'}];
const now=Date.now(),audience='redirect_uri:https://identity.example/identity/wallet/response';

async function credential({claims={organisation_id:'urn:example:lakeside',organisation_name:'Lakeside',membership:'member',member_name:'Robin'},hidden=['membership','member_name'],signer=issuer.priv,iss='https://issuer.example',exp=now/1000+3600,holderJwk=holder.pub}={}) {
  const disclosures={},payload={iss,vct:'https://issuer.example/membership',iat:Math.floor(now/1000),exp:Math.floor(exp),cnf:{jwk:holderJwk},_sd_alg:'sha-256',_sd:[],status:{status_list:{idx:3,uri:'https://issuer.example/status/1'}}};
  for(const [key,value] of Object.entries(claims)){
    if(hidden.includes(key)){const d=b64(JSON.stringify([b64(randomBytes(16)),key,value]));disclosures[key]=d;payload._sd.push(digest(d));}
    else payload[key]=value;
  }
  const jwt=await new SignJWT(payload).setProtectedHeader({alg:'ES256',typ:'dc+sd-jwt'}).sign(await importJWK(signer,'ES256'));
  return {jwt,disclosures};
}
async function present(cred,{reveal=['membership'],aud=audience,nonce='n-1',key=holder.priv,iat=now/1000,sdHash}={}) {
  const prefix=[cred.jwt,...reveal.map(r=>cred.disclosures[r])].join('~')+'~';
  const kb=await new SignJWT({aud,nonce,iat:Math.floor(iat),sd_hash:sdHash??digest(prefix)}).setProtectedHeader({alg:'ES256',typ:'kb+jwt'}).sign(await importJWK(key,'ES256'));
  return prefix+kb;
}
const verify=(p,o={})=>verifyPresentation(p,{trust,audience,nonce:'n-1',now,...o});

test('a trusted, holder-bound membership reveals only what was presented',async()=>{
  const proof=await verify(await present(await credential()));
  assert.equal(proof.claims.membership,'member');assert.equal(proof.claims.organisation_id,'urn:example:lakeside');
  assert.equal(proof.claims.member_name,undefined,'an undisclosed claim stays hidden');
  assert.deepEqual(proof.status,{idx:3,uri:'https://issuer.example/status/1'});assert.ok(proof.holderThumbprint);
});

test('wrong issuer, audience, nonce, holder, age or tampering is refused',async()=>{
  const cred=await credential();
  await assert.rejects(verify(await present(await credential({signer:stranger.priv}))),/signature/,'forged issuer signature');
  await assert.rejects(verify(await present(await credential({iss:'https://other.example'}))),/not accepted/,'untrusted issuer');
  await assert.rejects(verify(await present(cred,{aud:'redirect_uri:https://other.example/response'})),/Holder proof failed/,'wrong audience');
  await assert.rejects(verify(await present(cred,{nonce:'replayed'})),/another request/,'replayed into another request');
  await assert.rejects(verify(await present(cred,{key:stranger.priv})),/Holder proof failed/,'presented by someone else');
  await assert.rejects(verify(await present(cred,{iat:now/1000-3600})),/Holder proof failed/,'stale holder proof');
  await assert.rejects(verify(await present(cred,{sdHash:digest('other')})),/different disclosures/,'disclosures swapped after signing');
  await assert.rejects(verify((await present(cred)).replace(/~[^~]+$/,'~')),/Key binding is required/,'no holder proof');
  await assert.rejects(verify(await present(await credential({exp:now/1000-60}))),/validity period/,'expired credential');
  await assert.rejects(verify(await present(await credential({claims:{organisation_id:'urn:example:other',organisation_name:'Other',membership:'member'},hidden:['membership']}))),/different organisation/);
  const extra=b64(JSON.stringify(['salt','membership','admin']));
  const forged=(await present(cred)).replace('~','~'+extra+'~');
  await assert.rejects(verify(forged),/not covered|different disclosures/,'an injected disclosure is refused');
});

test('status lists: fresh, signed and addressed to this list, or refused',async()=>{
  const uri='https://issuer.example/status/1',statuses=Array(16).fill(0);statuses[3]=1;
  assert.equal(readStatus(encodeStatusList(statuses),3),1);assert.equal(readStatus(encodeStatusList(statuses),4),0);
  const token=await signStatusList({uri,statuses,privateJwk:issuer.priv,now});
  const ok=await verifyStatusList(token,{uri,publicJwk:issuer.pub,maxAge:60,now});
  assert.equal(readStatus(ok.list,3),1,'withdrawn');assert.equal(readStatus(ok.list,2),0,'still valid');
  await assert.rejects(verifyStatusList(token,{uri,publicJwk:issuer.pub,maxAge:60,now:now+61_000}),/fresh/,'too old for this receiver');
  await assert.rejects(verifyStatusList(token,{uri:'https://issuer.example/status/2',publicJwk:issuer.pub,maxAge:60,now}),/sub/,'another list');
  await assert.rejects(verifyStatusList(token,{uri,publicJwk:stranger.pub,maxAge:60,now}),/signature/,'unsigned by the issuer');
  await assert.rejects(verifyStatusList(await signStatusList({uri,statuses,privateJwk:issuer.priv,now:now-600_000,validFor:120}),{uri,publicJwk:issuer.pub,maxAge:3600,now}),/exp/,'expired list');
  await assert.rejects(verifyStatusList(token,{uri,publicJwk:issuer.pub,now}),/freshness bound/,'a receiver must set a bound');
});

async function fixture(t,{validFor=60}={}) {
  let clock=now,outage=false;const statuses=Array(16).fill(0);
  const dir=mkdtempSync(join(tmpdir(),'unanym-wallet-test-')),app=express();
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const bridge=createWalletBridge({dir,origin},{trust,maxStatusAge:20,refreshMs:60000,now:()=>clock,fetchImpl:async uri=>{
    if(outage)return new Response('',{status:503});
    return new Response(await signStatusList({uri,statuses,privateJwk:issuer.priv,validFor,now:clock}));
  }});
  const headers=(user='robin',binding='session-robin')=>({'x-user':user,'x-session':binding});
  bridge.mount(app,{session:req=>req.headers['x-user']?{id:req.headers['x-user']}:null,csrfBinding:req=>String(req.headers['x-session']??'')});
  const store=new Database(join(dir,'wallet.db'));
  t.after(async()=>{store.close();bridge.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  async function start(user='robin',binding='session-robin') {
    const h=headers(user,binding),r=await fetch(origin+'/identity/wallet',{headers:h});
    const text=await r.text(),link=text.match(/id="wallet-request" href="([^"]+)"/)[1].replaceAll('&amp;','&');
    const q=new URL(link).searchParams;h.cookie=r.headers.get('set-cookie').split(';')[0];
    return {h,state:q.get('state'),nonce:q.get('nonce')};
  }
  async function respond(request,options={}) {
    const token=await present(await credential(options),{aud:bridge.clientId,nonce:request.nonce,iat:clock/1000});
    const body=new URLSearchParams({state:request.state,vp_token:JSON.stringify({membership:[token]})});
    const r=await fetch(origin+'/identity/wallet/response',{method:'POST',body});
    assert.equal(r.status,200);return {url:(await r.json()).redirect_uri,body};
  }
  async function finish(url,h,{originHeader=origin}={}) {
    const u=new URL(url);return fetch(u.origin+u.pathname,{method:'POST',redirect:'manual',headers:{...h,...(originHeader?{Origin:originHeader}:{})},body:new URLSearchParams(u.searchParams)});
  }
  return {bridge,store,start,respond,finish,headers,setClock:v=>clock=v,setOutage:v=>outage=v,statuses,origin};
}

test('a wallet response needs its secret, original browser and unchanged account session before linking',async t=>{
  const f=await fixture(t),request=await f.start(),response=await f.respond(request);
  assert.equal(f.store.prepare('SELECT count(*) n FROM wallet_credentials').get().n,0,'back-channel proof does not link');
  assert.equal((await fetch(response.url,{headers:f.headers('sam','session-sam')})).status,403,'forwarded completion in another account refused');
  assert.equal((await f.finish(response.url,{...request.h,'x-session':'new-session'})).status,403,'even the same account needs its original session');
  assert.equal((await f.finish(response.url,request.h,{originHeader:null})).status,403,'cross-origin/missing-origin submission refused');
  const noSecret=new URL(response.url);noSecret.searchParams.delete('response_code');
  assert.equal((await f.finish(noSecret.href,request.h)).status,403,'request creator cannot finish without the wallet return code');
  assert.equal((await f.finish(response.url,request.h)).status,303);
  assert.equal(f.bridge.memberships('robin').length,1);
  assert.equal(f.bridge.memberships('sam').length,0);
  assert.equal((await f.finish(response.url,request.h)).status,403,'completion is single-use');
  assert.equal((await fetch(f.origin+'/identity/wallet/response',{method:'POST',body:response.body})).status,400,'presentation replay is refused');
});

test('a forwarded legitimate request cannot attach the holder membership to its creator',async t=>{
  const f=await fixture(t),attacker=await f.start('attacker','session-attacker');
  const response=await f.respond(attacker); // holder unknowingly answers another account request
  assert.equal((await f.finish(response.url,f.headers('robin','session-robin'))).status,403);
  assert.equal(f.bridge.memberships('attacker').length,0);
  assert.equal(f.store.prepare('SELECT count(*) n FROM wallet_credentials').get().n,0);
});

test('cached status expiry and exact freshness deadline are enforced on every read',async t=>{
  const f=await fixture(t,{validFor:1}),request=await f.start(),response=await f.respond(request);
  assert.equal((await f.finish(response.url,request.h)).status,303);assert.equal(f.bridge.memberships('robin').length,1);
  f.setClock(now+2000);assert.equal(f.bridge.memberships('robin').length,0,'expired cache cannot extend access');
  await f.bridge.refreshAll();assert.equal(f.bridge.memberships('robin').length,1);
});

test('status outage cannot outlive 20 seconds',async t=>{
  const f=await fixture(t),request=await f.start(),response=await f.respond(request);
  await f.finish(response.url,request.h);f.setOutage(true);
  f.setClock(now+19000);await f.bridge.refreshAll();assert.equal(f.bridge.memberships('robin').length,1);
  f.setClock(now+20000);assert.equal(f.bridge.memberships('robin').length,0,'no refresh-interval grace period');
});

test('same-day credential expiry remains valid and site statements reveal no approval or credential dates',async t=>{
  const f=await fixture(t),request=await f.start(),response=await f.respond(request,{exp:(now+60000)/1000});
  await f.finish(response.url,request.h);const [m]=f.bridge.memberships('robin');
  assert.equal(m.approvedAt,null);assert.equal(Date.parse(m.validUntil),Math.floor((now+60000)/1000)*1000);
  const {privateKey}=generateKeyPairSync('ed25519'),key=privateKey.export({format:'jwk'});
  const token=await issueMembership(key,{issuer:'https://operator.example',subject:'site-subject',audience:'site-a',organisation:m.organisation,
    approvedAt:null,validUntil:null,authorityMode:'wallet_verified',expiresAt:m.statementExpiresAt,now});
  const payload=await verifyMembership(token,{signer:'https://operator.example',organisationId:m.organisation.id,subject:'site-subject',audience:'site-a',mode:'wallet_verified',publicKey:await membershipKey(key),now});
  assert.equal(payload.membership.approved_at,null);assert.equal(payload.membership.valid_until,null);
  assert.ok(payload.exp*1000<=m.statementExpiresAt,'token cannot outlive the checked status or credential');
  f.setClock(now+60000);await f.bridge.refreshAll();assert.equal(f.bridge.memberships('robin').length,0,'actual credential deadline enforced');
});
