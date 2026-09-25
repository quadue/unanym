import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registeredClients} from '../src/config.js';

const client=()=>({client_id:'coco',name:'CoCo',homepage:'https://coco.example/',redirect_uris:['https://auth.example/auth/v1/callback'],authentication_origin:'https://auth.example',token_endpoint_auth_method:'client_secret_basic'});
const secret={coco:'x'.repeat(40)};
test('a confidential site can explicitly register its hosted authentication backend',()=>{
 assert.equal(registeredClients([client()],secret)[0].homepage,'https://coco.example/');
 for(const change of [{authentication_origin:undefined},{authentication_origin:'https://other.example'},{authentication_origin:'http://auth.example'},{authentication_origin:'https://auth.example/path'},{authentication_origin:'https://user:pass@auth.example'},{token_endpoint_auth_method:'none'},{homepage:'javascript:alert(1)'}])assert.throws(()=>registeredClients([{...client(),...change}],secret));
 assert.throws(()=>registeredClients([{...client(),redirect_uris:['https://auth.example/auth/v1/callback','https://coco.example/callback']}],secret));
 assert.throws(()=>registeredClients([client(),{...client(),client_id:'other'}],{...secret,other:secret.coco}));
});
