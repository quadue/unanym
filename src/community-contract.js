import {createPrivateKey,createPublicKey,randomUUID} from 'node:crypto';
import {SignJWT,jwtVerify,calculateJwkThumbprint} from 'jose';

// Community identity profile 1. Legacy drop_* contracts are a separate profile.
export const communityContract=Object.freeze({version:1,identityScope:'identity.v1',membershipScope:'memberships.v1',identityClaim:'identity_v1',membershipClaim:'memberships_v1',membershipType:'community-membership+jwt'});
const fail=()=>{throw new TypeError('Invalid community membership statement');};
const text=(s,max=200)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\x00-\x1f\x7f]/.test(s);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const uri=s=>{try{return text(s,500)&&['https:','urn:','http:'].includes(new URL(s).protocol);}catch{return false;}};
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(Date.parse(s));

export function validateMembership(p) {
  if(!exact(p,['ver','iss','sub','aud','iat','nbf','exp','jti','organisation','membership','authority']))fail();
  if(p.ver!==1||!uri(p.iss)||!text(p.sub)||!text(p.aud)||!text(p.jti))fail();
  if(![p.iat,p.nbf,p.exp].every(Number.isSafeInteger)||p.nbf!==p.iat||p.exp<=p.iat||p.exp-p.iat>300)fail();
  if(!exact(p.organisation,['id','name'])||!uri(p.organisation.id)||!text(p.organisation.name,120))fail();
  if(!exact(p.membership,['kind','status','approved_at','valid_until'])||p.membership.kind!=='member'||p.membership.status!=='active'||!date(p.membership.approved_at))fail();
  if(Date.parse(p.membership.approved_at)>p.iat*1000+1000)fail();
  if(p.membership.valid_until!==null&&(!date(p.membership.valid_until)||Date.parse(p.membership.valid_until)<p.exp*1000))fail();
  if(!exact(p.authority,['mode'])||!['operator_attested','organisation_signed'].includes(p.authority.mode))fail();
  if(p.authority.mode==='organisation_signed'&&p.iss!==p.organisation.id)fail();
  return p;
}

export async function membershipKey(jwk) {
  const key=createPublicKey(createPrivateKey({key:jwk,format:'jwk'})).export({format:'jwk'});
  if(key.kty!=='OKP'||key.crv!=='Ed25519')fail();
  return {...key,kid:await calculateJwkThumbprint(key),alg:'EdDSA',use:'sig'};
}

export async function issueMembership(jwk,{issuer,subject,audience,organisation,approvedAt,validUntil=null,authorityMode='operator_attested',now=Date.now()}) {
  const iat=Math.floor(now/1000),exp=Math.min(iat+300,validUntil===null?Infinity:Math.floor(Date.parse(validUntil)/1000));
  const payload=validateMembership({ver:1,iss:issuer,sub:subject,aud:audience,iat,nbf:iat,exp,jti:randomUUID(),organisation,
    membership:{kind:'member',status:'active',approved_at:approvedAt,valid_until:validUntil},authority:{mode:authorityMode}});
  const publicKey=await membershipKey(jwk);
  return new SignJWT(payload).setProtectedHeader({typ:communityContract.membershipType,alg:'EdDSA',kid:publicKey.kid}).sign(createPrivateKey({key:jwk,format:'jwk'}));
}

/** Trust is supplied by the receiver, never by a key or organisation in the JWT. */
export async function verifyMembership(token,{signer,organisationId,subject,audience,mode,publicKey,now=Date.now()}) {
  if(!['operator_attested','organisation_signed'].includes(mode)||!uri(signer)||!uri(organisationId))fail();
  if(publicKey.kty!=='OKP'||publicKey.crv!=='Ed25519'||Object.hasOwn(publicKey,'d'))fail();
  const {payload,protectedHeader}=await jwtVerify(token,createPublicKey({key:publicKey,format:'jwk'}),{
    algorithms:['EdDSA'],typ:communityContract.membershipType,issuer:signer,audience,subject,
    currentDate:new Date(now),maxTokenAge:'5m',clockTolerance:0,requiredClaims:['iat','nbf','exp','jti','sub','aud']});
  if(!exact(protectedHeader,['typ','alg','kid'])||protectedHeader.kid!==await calculateJwkThumbprint(publicKey))fail();
  validateMembership(payload);
  if(payload.organisation.id!==organisationId||payload.authority.mode!==mode)fail();
  return payload;
}
