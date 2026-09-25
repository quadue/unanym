import express from 'express';
import {signStatusList} from '../../src/wallet/status-list.js';
import {testIssuerKey} from './issuer-key.js';

// A fictional organisation's Token Status List publisher. It re-signs on every
// request, so receivers control freshness. Admin routes listen on loopback only.
const port=Number(process.env.ORG_STATUS_PORT??7012),uri=`http://localhost:${port}/status/lakeside/1`;
const statuses=Array(1024).fill(0),{privateJwk}=testIssuerKey();
const app=express();
let outage=false;
app.post('/admin/outage/:state',(req,res)=>{outage=req.params.state==='on';res.json({outage});});
app.get('/status/lakeside/1',async(_req,res)=>outage?res.sendStatus(503):res.type('application/statuslist+jwt').send(await signStatusList({uri,statuses,privateJwk,ttl:5,validFor:60})));
app.post('/admin/:action/:idx',(req,res)=>{
  const idx=Number(req.params.idx);
  if(!Number.isInteger(idx)||idx<0||idx>=statuses.length)return res.sendStatus(400);
  statuses[idx]=req.params.action==='revoke'?1:0;res.json({idx,status:statuses[idx],at:Date.now()});
});
app.listen(port,'127.0.0.1',()=>console.log('Fictional organisation status list:',uri));
