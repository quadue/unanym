import {createHash} from 'node:crypto';
import {jwtVerify,importJWK,decodeJwt,decodeProtectedHeader,calculateJwkThumbprint} from 'jose';

// Verifies an SD-JWT VC presentation with key binding (IETF SD-JWT, SD-JWT VC).
// The receiver supplies trust: which issuers, keys, credential types and
// organisations it accepts. Nothing in the presentation establishes trust by itself.
const fail=message=>{throw Object.assign(new Error(message),{name:'PresentationError'});};
const digest=text=>createHash('sha256').update(text).digest('base64url');
const RESERVED=new Set(['_sd','_sd_alg','...','iss','sub','iat','nbf','exp','cnf','vct','status']);

function disclose(payload,disclosures) {
  const available=new Map();
  for(const encoded of disclosures){
    let entry;
    try{entry=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{fail('Unreadable disclosure');}
    if(!Array.isArray(entry)||entry.length!==3||typeof entry[1]!=='string')fail('Only object property disclosures are accepted');
    const hash=digest(encoded);
    if(available.has(hash))fail('Repeated disclosure');
    available.set(hash,entry);
  }
  const used=new Set(),claims={};
  for(const [key,value] of Object.entries(payload))if(key!=='_sd'&&key!=='_sd_alg')claims[key]=value;
  for(const hash of payload._sd??[]){
    const entry=available.get(hash);if(!entry)continue;
    const [,name,value]=entry;
    if(RESERVED.has(name)||Object.hasOwn(claims,name))fail('Disclosure overrides a protected claim');
    claims[name]=value;used.add(hash);
  }
  if(used.size!==available.size)fail('Disclosure not covered by the issuer signature');
  return claims;
}

/**
 * @param presentation  compact SD-JWT: issuer-jwt~disclosure~...~kb-jwt
 * @param trust         [{issuer, publicJwk, alg, vct, organisationId}]
 * @param audience      the verifier's client_id, exactly as sent in the request
 * @param nonce         the single-use nonce from that request
 */
export async function verifyPresentation(presentation,{trust,audience,nonce,now=Date.now(),maxKeyBindingAge=300}) {
  if(typeof presentation!=='string'||presentation.length>64_000)fail('Invalid presentation');
  const parts=presentation.split('~');
  if(parts.length<2)fail('Invalid presentation');
  const keyBinding=parts.pop();
  if(!keyBinding)fail('Key binding is required');
  const [issuerJwt,...disclosures]=parts;
  let unverified,header;
  try{unverified=decodeJwt(issuerJwt);header=decodeProtectedHeader(issuerJwt);}catch{fail('Invalid credential');}
  const trusted=trust.find(t=>t.issuer===unverified.iss&&t.vct===unverified.vct);
  if(!trusted)fail('Credential issuer or type not accepted');
  if(header.alg!==trusted.alg)fail('Unexpected credential algorithm');
  const {payload}=await jwtVerify(issuerJwt,await importJWK(trusted.publicJwk,trusted.alg),{typ:'dc+sd-jwt',algorithms:[trusted.alg],issuer:trusted.issuer,currentDate:new Date(now)})
    .catch(()=>fail('Credential signature, validity period or type failed'));
  if((payload._sd_alg??'sha-256')!=='sha-256')fail('Unsupported disclosure hash');
  const claims=disclose(payload,disclosures.filter(Boolean));
  if(claims.organisation_id!==trusted.organisationId)fail('Credential names a different organisation');
  const holder=payload.cnf?.jwk;
  if(!holder||holder.d)fail('Credential is not bound to a holder key');
  const kbHeader=decodeProtectedHeader(keyBinding);
  if(!['ES256','EdDSA'].includes(kbHeader.alg))fail('Unexpected key binding algorithm');
  const {payload:kb}=await jwtVerify(keyBinding,await importJWK(holder,kbHeader.alg),{typ:'kb+jwt',algorithms:[kbHeader.alg],audience,currentDate:new Date(now),maxTokenAge:maxKeyBindingAge+'s',requiredClaims:['iat','nonce','sd_hash']})
    .catch(()=>fail('Holder proof failed: wrong key, audience or age'));
  if(kb.nonce!==nonce)fail('Holder proof is for another request');
  if(kb.sd_hash!==digest(parts.join('~')+'~'))fail('Holder proof covers different disclosures');
  return {claims,issuer:payload.iss,vct:payload.vct,expiresAt:payload.exp?payload.exp*1000:null,
    status:payload.status?.status_list??null,holderThumbprint:await calculateJwkThumbprint(holder)};
}
