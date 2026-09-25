import express from 'express';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {configuration} from '../../src/config.js';
import {createService} from '../../src/service.js';
import {independentFixture} from '../../scripts/independent-fixture.js';
import {createWalletBridge} from '../../src/wallet/bridge.js';
import {testIssuerKey} from './issuer-key.js';

// Unanym with the experimental wallet path and two fictional websites on
// different hostnames. Fictional accounts; loopback only.
const port=Number(process.env.UNANYM_PORT??7010),origin=`http://localhost:${port}`;
const dir=resolve(process.env.UNANYM_EXP_DIR??'data/wallet-experiment');mkdirSync(dir,{recursive:true});
writeFileSync(resolve(dir,'clients.json'),JSON.stringify([
  {client_id:'site-a',name:'Site A',description:'Fictional receiving website A',homepage:'http://localhost:7021/',redirect_uris:['http://localhost:7021/cb']},
    {client_id:'site-b',name:'Site B',description:'Fictional receiving website B',homepage:'http://127.0.0.1:7022/',redirect_uris:['http://127.0.0.1:7022/cb'] }].map(c=>({...c,allow_wallet_memberships:true}))));
const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Experiment operator',
  IDENTITY_DATA_DIR:resolve(dir,'identity'),IDENTITY_CLIENTS:resolve(dir,'clients.json'),IDENTITY_DEMO:'1'});
const issuer=process.env.WALLET_ISSUER??'http://localhost:7005/openid4vci';
const bridge=createWalletBridge(config,{trust:[{issuer,publicJwk:testIssuerKey().publicJwk,alg:'ES256',vct:issuer+'/community_membership',organisationId:'urn:example:lakeside-association'}],
  maxStatusAge:Number(process.env.MAX_STATUS_AGE??20),refreshMs:Number(process.env.STATUS_REFRESH_MS??5000)});
const f=independentFixture({v1:true});
// Experiment evidence only: keep the last wallet response to test replay and disclosure.
let last={};
const capture=(app)=>app.post('/identity/wallet/response',express.urlencoded({extended:false,limit:'96kb'}),(req,_res,next)=>{
  try{const token=JSON.parse(req.body.vp_token);const presentation=[].concat(token.membership)[0];
    const disclosed=presentation.split('~').slice(1,-1).filter(Boolean).map(d=>JSON.parse(Buffer.from(d,'base64url'))[1]);
    last={form:{...req.body},disclosed};}catch{last={form:{...req.body}};}
  next();
});
const service=createService(config,bridge.adapter(f.adapter),{mountRoutes:app=>{capture(app);bridge.mount(app,{session:req=>f.adapter.session(req),csrfBinding:req=>f.adapter.csrfBinding(req)});}});
service.app.get('/experiment/last-presentation',(_req,res)=>res.json(last));
service.app.post('/demo/login',express.urlencoded({extended:false}),(req,res)=>{
  res.cookie('pl_session',f.login(req.body.account),{httpOnly:true,sameSite:'lax',path:'/'});res.redirect(303,String(req.body.next??'/identity/'));
});
service.app.listen(port,'127.0.0.1',()=>console.log('Unanym wallet experiment:',origin,'client_id',bridge.clientId));
