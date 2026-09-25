import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {SignJWT} from 'jose';
import {issueConfirmation,verifyConfirmation} from '../src/confirmation-contract.js';
import {issueMembership,verifyMembership,membershipKey} from '../src/community-contract.js';

test('introduction proof is distinct, audience-bound, expiring and checked independently by PHP',async()=>{
 const jwk=generateKeyPairSync('ed25519').privateKey.export({format:'jwk'}),publicKey=await membershipKey(jwk),now=Date.now();
 const details={issuer:'https://identity.example/identity/oidc',subject:'site-a-person',audience:'website-a',organisation:{id:'urn:uuid:fictional-provider',name:'Example association'},confirmedAt:new Date(now-1000).toISOString(),now};
 const trust={signer:details.issuer,organisationId:details.organisation.id,subject:details.subject,audience:details.audience,publicKey,now};
 const token=await issueConfirmation(jwk,details),valid=await verifyConfirmation(token,trust);
 assert.equal(valid.confirmation.kind,'community_introduction');assert.equal(valid.authority.mode,'operator_attested');
 const php=`define('ABSPATH',true);function drop_identity_b64($s){return rtrim(strtr(base64_encode($s),'+/','-_'),'=');}require 'integrations/wordpress/drop-identity/memberships.php';require 'integrations/wordpress/drop-identity/confirmations.php';$v=json_decode(stream_get_contents(STDIN),true);echo json_encode(unanym_confirmations($v['claim'],$v['sub'],$v['config'],$v['now']));`;
 const input={claim:{version:1,statements:[token]},sub:details.subject,config:{issuer:details.issuer,client_id:details.audience,membership_key:publicKey,organisations:[details.organisation.id]},now:Math.floor(now/1000)};
 const run=(v=input)=>{
  const options={input:JSON.stringify(v),stdio:['pipe','pipe','pipe']};
  try{return execFileSync('php',['-r',php],options);}
  catch(e){if(e.code!=='ENOENT')throw e;return execFileSync('docker',['run','--rm','-i','--network','none','-v',process.cwd()+':/app:ro','-w','/app','php:8.3-cli@sha256:db99254edaf6de1644b16afa38b150b8b89f05ec4091a631b59a954dd1330058','php','-r',php],options);}
 };
 assert.equal(JSON.parse(run()).length,1);
 assert.equal(JSON.parse(run({...input,config:{...input.config,organisations:[]}})).length,0);
 for(const override of [{signer:undefined},{subject:undefined},{audience:undefined},{subject:'another-person'},{audience:'website-b'},{signer:'https://wrong.example'},{organisationId:'urn:other'},{now:now+300_000}])await assert.rejects(verifyConfirmation(token,{...trust,...override}));
 for(const override of [{sub:'another-person'},{config:{...input.config,client_id:'website-b'}},{now:input.now+300}])assert.throws(()=>run({...input,...override}));
 await assert.rejects(verifyMembership(token,{...trust,mode:'operator_attested'}));
 const membership=await issueMembership(jwk,{...details,approvedAt:details.confirmedAt});
 await assert.rejects(verifyConfirmation(membership,trust));assert.throws(()=>run({...input,claim:{version:1,statements:[membership]}}));
 for(const altered of [{...valid,email:'private@example.test'},{...valid,exp:valid.exp+1},{...valid,confirmation:{...valid.confirmation,kind:'qualified_counsellor'}},{...valid,authority:{mode:'organisation_signed'}}]){
  const forged=await new SignJWT(altered).setProtectedHeader({typ:'community-confirmation+jwt',alg:'EdDSA',kid:publicKey.kid}).sign(createPrivateKey({key:jwk,format:'jwk'}));
  await assert.rejects(verifyConfirmation(forged,trust));assert.throws(()=>run({...input,claim:{version:1,statements:[forged]}}));
 }
});
