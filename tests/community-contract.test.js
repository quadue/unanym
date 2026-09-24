import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {SignJWT} from 'jose';
import {issueMembership,verifyMembership,membershipKey,communityContract} from '../src/community-contract.js';

const key=()=>generateKeyPairSync('ed25519').privateKey.export({format:'jwk'});
const now=Date.parse('2026-09-24T12:00:00Z');
const details={issuer:'https://identity.example/identity/oidc',subject:'pairwise-subject',audience:'website-a',organisation:{id:'urn:uuid:organisation-a',name:'Example association'},approvedAt:'2026-09-24T11:00:00Z',now};
const trust=async jwk=>({signer:details.issuer,organisationId:details.organisation.id,subject:details.subject,audience:details.audience,mode:'operator_attested',publicKey:await membershipKey(jwk),now});

test('v1 statement proves an operator assertion, bound to receiver, subject, organisation and time',async()=>{
  const jwk=key(),token=await issueMembership(jwk,details),expected=await trust(jwk);
  const p=await verifyMembership(token,expected);
  assert.equal(p.authority.mode,'operator_attested');assert.equal(p.exp-p.iat,300);
  for(const override of [{subject:'another-member'},{audience:'website-b'},{organisationId:'urn:uuid:another-org'},{signer:'https://other.example'},{mode:'organisation_signed'},{now:now+300_000},{publicKey:await membershipKey(key())}]){
    await assert.rejects(verifyMembership(token,{...expected,...override}));
  }
});
test('organisation signing uses its own pinned key and cannot be upgraded from operator proof',async()=>{
  const jwk=key(),org=details.organisation.id;
  const token=await issueMembership(jwk,{...details,issuer:org,authorityMode:'organisation_signed'});
  assert.equal((await verifyMembership(token,{...await trust(jwk),signer:org,mode:'organisation_signed'})).authority.mode,'organisation_signed');
  await assert.rejects(issueMembership(jwk,{...details,authorityMode:'organisation_signed'}));
  await assert.rejects(verifyMembership(token,await trust(jwk)));
});
test('v1 rejects invented claims, unknown versions, excessive validity and self-supplied verification keys',async()=>{
  const jwk=key(),expected=await trust(jwk),valid=await verifyMembership(await issueMembership(jwk,details),expected);
  for(const p of [{...valid,email:'private@example.test'},{...valid,ver:2},{...valid,exp:valid.exp+1},{...valid,membership:{...valid.membership,training_verified:true}}]){
    const token=await new SignJWT(p).setProtectedHeader({alg:'EdDSA',typ:communityContract.membershipType,kid:expected.publicKey.kid}).sign(createPrivateKey({key:jwk,format:'jwk'}));
    await assert.rejects(verifyMembership(token,expected));
  }
  const token=await new SignJWT(valid).setProtectedHeader({alg:'EdDSA',typ:communityContract.membershipType,kid:expected.publicKey.kid,jwk:expected.publicKey}).sign(createPrivateKey({key:jwk,format:'jwk'}));
  await assert.rejects(verifyMembership(token,expected));
});
