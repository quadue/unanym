// Optional, separately consented community introduction confirmation.
// This type cannot be read as membership, a qualification or a safety assessment.
import {createPrivateKey,createPublicKey,randomUUID} from 'node:crypto';
import {SignJWT,jwtVerify,calculateJwkThumbprint} from 'jose';
import {membershipKey,validateMembership} from './community-contract.js';

export const confirmationKind='community_introduction';
export const confirmationLabel='Community introduction completed';
const type='community-confirmation+jwt';
const fail=()=>{throw new TypeError('Invalid community confirmation');};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
export function validateConfirmation(p){
  if(!exact(p,['ver','iss','sub','aud','iat','nbf','exp','jti','organisation','confirmation','authority']))fail();
  const c=p.confirmation;
  if(!exact(c,['kind','status','confirmed_at','valid_until'])||c.kind!==confirmationKind||c.status!=='confirmed'||p.authority?.mode!=='operator_attested')fail();
  // Reuse the exact binding/time/organisation rules of v1, after validating the
  // distinct confirmation shape. This does not change either signed wire type.
  const {confirmation,...bound}=p;
  validateMembership({...bound,membership:{kind:'member',status:'active',approved_at:c.confirmed_at,valid_until:c.valid_until}});
  return p;
}
export async function issueConfirmation(jwk,{issuer,subject,audience,organisation,confirmedAt,validUntil=null,now=Date.now()}){
  const iat=Math.floor(now/1000),exp=Math.min(iat+300,validUntil===null?Infinity:Math.floor(Date.parse(validUntil)/1000));
  const payload=validateConfirmation({ver:1,iss:issuer,sub:subject,aud:audience,iat,nbf:iat,exp,jti:randomUUID(),organisation,
    confirmation:{kind:confirmationKind,status:'confirmed',confirmed_at:confirmedAt,valid_until:validUntil},authority:{mode:'operator_attested'}});
  const key=await membershipKey(jwk);
  return new SignJWT(payload).setProtectedHeader({typ:type,alg:'EdDSA',kid:key.kid}).sign(createPrivateKey({key:jwk,format:'jwk'}));
}
export async function verifyConfirmation(token,{signer,organisationId,subject,audience,publicKey,now=Date.now()}){
  if([signer,organisationId,subject,audience].some(v=>typeof v!=='string'||!v.trim()||v.length>500||/[\x00-\x1f\x7f]/.test(v)))fail();
  if(publicKey?.kty!=='OKP'||publicKey.crv!=='Ed25519'||Object.hasOwn(publicKey,'d'))fail();
  const {payload,protectedHeader}=await jwtVerify(token,createPublicKey({key:publicKey,format:'jwk'}),{
    algorithms:['EdDSA'],typ:type,issuer:signer,audience,subject,currentDate:new Date(now),maxTokenAge:'5m',clockTolerance:0,requiredClaims:['iat','nbf','exp','jti','sub','aud']});
  if(!exact(protectedHeader,['typ','alg','kid'])||protectedHeader.kid!==await calculateJwkThumbprint(publicKey))fail();
  validateConfirmation(payload);
  if(payload.organisation.id!==organisationId)fail();
  return payload;
}
