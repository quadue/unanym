import {deflateSync,inflateSync} from 'node:zlib';
import {SignJWT,jwtVerify,importJWK} from 'jose';

// IETF Token Status List (draft-ietf-oauth-status-list): entries of `bits` bits,
// least-significant bit first within each byte, DEFLATE with ZLIB wrapping.
// Status 0 = valid; any other value (revoked, suspended) is treated as unusable.
export const STATUS_VALID=0;
const fail=message=>{throw Object.assign(new Error(message),{name:'StatusListError'});};

export function encodeStatusList(statuses,bits=1) {
  if(![1,2,4,8].includes(bits))fail('Unsupported status size');
  const perByte=8/bits,bytes=new Uint8Array(Math.ceil(statuses.length/perByte));
  statuses.forEach((value,index)=>{bytes[Math.floor(index/perByte)]|=(value&((1<<bits)-1))<<((index%perByte)*bits);});
  return {bits,lst:deflateSync(bytes).toString('base64url')};
}

export function readStatus(list,index) {
  if(!Number.isSafeInteger(index)||index<0)fail('Invalid status index');
  if(![1,2,4,8].includes(list?.bits)||typeof list.lst!=='string')fail('Invalid status list');
  const bytes=inflateSync(Buffer.from(list.lst,'base64url')),perByte=8/list.bits,byte=bytes[Math.floor(index/perByte)];
  if(byte===undefined)fail('Status index outside the list');
  return (byte>>((index%perByte)*list.bits))&((1<<list.bits)-1);
}

// Signed by the credential issuer (or its declared status signer). The publisher
// re-signs on every change and at least once per `validFor` seconds.
export async function signStatusList({uri,statuses,privateJwk,alg='ES256',bits=1,ttl=30,validFor=120,now=Date.now()}) {
  const iat=Math.floor(now/1000);
  return new SignJWT({sub:uri,iat,exp:iat+validFor,ttl,status_list:encodeStatusList(statuses,bits)})
    .setProtectedHeader({typ:'statuslist+jwt',alg}).sign(await importJWK(privateJwk,alg));
}

// Freshness is the receiver's rule, not the publisher's: a list older than
// `maxAge` seconds is refused even if it has not expired.
export async function verifyStatusList(token,{uri,publicJwk,alg='ES256',maxAge,now=Date.now()}) {
  if(!Number.isSafeInteger(maxAge)||maxAge<=0)fail('A freshness bound is required');
  const {payload}=await jwtVerify(token,await importJWK(publicJwk,alg),{typ:'statuslist+jwt',algorithms:[alg],subject:uri,currentDate:new Date(now),requiredClaims:['iat','sub']});
  if(payload.iat*1000>now+5000)fail('Status list issued in the future');
  if(now-payload.iat*1000>maxAge*1000)fail('Status list is not fresh enough');
  readStatus(payload.status_list,0);
  return {list:payload.status_list,issuedAt:payload.iat*1000,expiresAt:payload.exp?payload.exp*1000:null};
}
