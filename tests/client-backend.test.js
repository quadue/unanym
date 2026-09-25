import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registeredClients} from '../src/config.js';
import {configuration} from '../src/config.js';
import {createService} from '../src/service.js';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const client=()=>({client_id:'coco',name:'CoCo',homepage:'https://coco.example/',redirect_uris:['https://auth.example/auth/v1/callback'],authentication_origin:'https://auth.example',token_endpoint_auth_method:'client_secret_basic'});
const secret={coco:'x'.repeat(40)};
test('a confidential site can explicitly register its hosted authentication backend',()=>{
 assert.equal(registeredClients([client()],secret)[0].homepage,'https://coco.example/');
 for(const change of [{authentication_origin:undefined},{authentication_origin:'https://other.example'},{authentication_origin:'http://auth.example'},{authentication_origin:'https://auth.example/path'},{authentication_origin:'https://user:pass@auth.example'},{token_endpoint_auth_method:'none'},{homepage:'javascript:alert(1)'}])assert.throws(()=>registeredClients([{...client(),...change}],secret));
 assert.throws(()=>registeredClients([{...client(),redirect_uris:['https://auth.example/auth/v1/callback','https://coco.example/callback']}],secret));
 assert.throws(()=>registeredClients([client(),{...client(),client_id:'other'}],{...secret,other:secret.coco}));
});
test('consent permits the registered backend and website redirect chain, not arbitrary destinations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'unanym-client-backend-'));
 writeFileSync(join(dir,'clients.json'),JSON.stringify([client()]));writeFileSync(join(dir,'secrets.json'),JSON.stringify(secret));
 const config=configuration({IDENTITY_DATA_DIR:dir,IDENTITY_CLIENTS:join(dir,'clients.json'),IDENTITY_CLIENT_SECRETS:join(dir,'secrets.json')});
 const source={session:()=>null,account:()=>null,memberships:()=>[],isOpen:()=>true,csrfBinding:()=>'',loginURL:()=>'/login',close(){}};
 const service=createService(config,source),server=service.app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try{
  const res=await fetch(`http://127.0.0.1:${server.address().port}/identity/health`);
  const policy=res.headers.get('content-security-policy');
  assert.match(policy,/form-action 'self' https:\/\/coco\.example https:\/\/auth\.example;/);
  assert.doesNotMatch(policy,/form-action[^;]*\*/);
 }finally{await new Promise(resolve=>server.close(resolve));service.close();rmSync(dir,{recursive:true,force:true});}
});
