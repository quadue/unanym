import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {SignJWT,importJWK} from 'jose';
import {verifyPresentation} from '../src/wallet/sd-jwt.js';
import {signStatusList,verifyStatusList,readStatus,encodeStatusList} from '../src/wallet/status-list.js';

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
