import Database from 'better-sqlite3';
import express from 'express';
import {createHash,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyPresentation} from './sd-jwt.js';
import {verifyStatusList,readStatus,STATUS_VALID} from './status-list.js';
import {page,escape} from '../views.js';

// Experimental wallet path (OpenID4VP 1.0, SD-JWT VC). A member links a membership
// credential from their own wallet to their account once; websites then receive
// Unanym's ordinary per-site statement, never the credential, holder key or
// status reference. Each statement requires a fresh, valid status list.
const day=ms=>new Date(Math.floor(ms/86_400_000)*86_400_000).toISOString();
const short=text=>createHash('sha256').update(text).digest('base64url').slice(0,16);

export function createWalletBridge(config,{trust,maxStatusAge=60,refreshMs=15_000,requestTtl=300_000,fetchImpl=fetch}) {
  const base=config.basePath??'/identity',responseUri=config.origin+base+'/wallet/response';
  const clientId='redirect_uri:'+responseUri;
  const db=new Database(resolve(config.dir,'wallet.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS wallet_credentials (account TEXT NOT NULL, issuer TEXT NOT NULL, organisation_id TEXT NOT NULL,
    organisation_name TEXT NOT NULL, holder TEXT NOT NULL, status_uri TEXT, status_idx INTEGER, expires INTEGER, linked_at INTEGER NOT NULL,
    PRIMARY KEY(account,issuer,organisation_id))`);
  const requests=new Map(),statusCache=new Map();
  const dcql={credentials:[{id:'membership',format:'dc+sd-jwt',meta:{vct_values:[...new Set(trust.map(t=>t.vct))]},
    claims:[{path:['organisation_id']},{path:['organisation_name']},{path:['membership']}]}]};

  async function refresh(uri) {
    const row=db.prepare('SELECT issuer FROM wallet_credentials WHERE status_uri=? LIMIT 1').get(uri);
    const signer=trust.find(t=>t.issuer===row?.issuer);
    if(!signer)return;
    try{
      const response=await fetchImpl(uri,{signal:AbortSignal.timeout(5000),headers:{Accept:'application/statuslist+jwt'}});
      if(!response.ok)throw new Error('status '+response.status);
      statusCache.set(uri,await verifyStatusList(await response.text(),{uri,publicJwk:signer.statusJwk??signer.publicJwk,alg:signer.alg,maxAge:maxStatusAge}));
    }catch{/* A failed refresh leaves the previous entry to age out and fail closed. */}
  }
  const refreshAll=()=>Promise.all(db.prepare('SELECT DISTINCT status_uri FROM wallet_credentials WHERE status_uri IS NOT NULL').all().map(r=>refresh(r.status_uri)));
  const timer=setInterval(refreshAll,refreshMs);timer.unref();

  // Current only if unexpired, and its status list is verified, fresh and valid.
  function current(row,now=Date.now()) {
    if(row.expires && row.expires<=now)return false;
    if(!row.status_uri)return false;
    const entry=statusCache.get(row.status_uri);
    if(!entry || now-entry.issuedAt>maxStatusAge*1000)return false;
    try{return readStatus(entry.list,row.status_idx)===STATUS_VALID;}catch{return false;}
  }

  function memberships(accountId) {
    return db.prepare('SELECT * FROM wallet_credentials WHERE account=?').all(accountId).filter(row=>current(row)).map(row=>({
      slug:'wallet-'+short(row.issuer+'\0'+row.organisation_id),name:row.organisation_name,
      organisation:{id:row.organisation_id,name:row.organisation_name},
      // Coarsened to the day: exact linking or expiry times would be shared, identical values across websites.
      approvedAt:day(row.linked_at),validUntil:row.expires?day(row.expires):null,authorityMode:'wallet_verified'}));
  }
  function adapter(inner) {
    return {...inner,memberships(id){return [...inner.memberships(id),...(inner.account(id)?memberships(id):[])];}};
  }

  function mount(app,{session}) {
    app.get(base+'/wallet',(req,res)=>{
      const user=session(req);
      if(!user)return res.redirect(config.loginPath?.(req.path)??'/');
      const state=randomBytes(24).toString('base64url'),nonce=randomBytes(24).toString('base64url');
      for(const [key,value] of requests)if(value.expires<Date.now())requests.delete(key);
      requests.set(state,{nonce,account:user.id,expires:Date.now()+requestTtl});
      const request='openid4vp://?'+new URLSearchParams({client_id:clientId,response_type:'vp_token',response_mode:'direct_post',
        response_uri:responseUri,nonce,state,dcql_query:JSON.stringify(dcql),
        client_metadata:JSON.stringify({vp_formats_supported:{'dc+sd-jwt':{'sd-jwt_alg_values':['ES256'],'kb-jwt_alg_values':['ES256','EdDSA']}}})});
      const rows=db.prepare('SELECT * FROM wallet_credentials WHERE account=?').all(user.id);
      res.send(page('Add from your wallet',`<section class="narrow"><p class="eyebrow">Experimental</p><h1>Add a membership from your wallet</h1>
        <p class="lead small">Open this request in your wallet. It asks only for the organisation and your membership, not your name. Websites later receive ${escape(config.displayName??'FRRN')}’s usual website-specific statement, never the credential itself.</p>
        <div class="actions"><a class="button" id="wallet-request" href="${escape(request)}">Open in your wallet</a></div>
        <h2>Linked from a wallet</h2>${rows.length?'<ul>'+rows.map(r=>`<li>${escape(r.organisation_name)} · ${current(r)?'current':'not currently confirmed'}</li>`).join('')+'</ul>':'<p>None yet.</p>'}</section>`,config));
    });
    app.post(base+'/wallet/response',express.urlencoded({extended:false,limit:'96kb'}),async(req,res)=>{
      const pending=requests.get(String(req.body.state??''));
      requests.delete(String(req.body.state??''));
      if(!pending||pending.expires<Date.now())return res.status(400).json({error:'invalid_request',error_description:'Unknown or expired request'});
      try{
        const token=JSON.parse(String(req.body.vp_token??''));
        const values=token?.membership,presentation=Array.isArray(values)?values[0]:values;
        const proof=await verifyPresentation(presentation,{trust,audience:clientId,nonce:pending.nonce});
        if(proof.claims.membership!=='member')throw Object.assign(new Error('Not a membership'),{name:'PresentationError'});
        db.prepare(`INSERT INTO wallet_credentials VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(account,issuer,organisation_id) DO UPDATE SET
          organisation_name=excluded.organisation_name,holder=excluded.holder,status_uri=excluded.status_uri,status_idx=excluded.status_idx,expires=excluded.expires,linked_at=excluded.linked_at`)
          .run(pending.account,proof.issuer,proof.claims.organisation_id,String(proof.claims.organisation_name??proof.claims.organisation_id).slice(0,120),
            proof.holderThumbprint,proof.status?.uri??null,proof.status?.idx??null,proof.expiresAt,Date.now());
        if(proof.status?.uri)await refresh(proof.status.uri);
        res.json({});
      }catch(error){
        res.status(400).json({error:'invalid_request',error_description:error.name==='PresentationError'||error.name==='StatusListError'?error.message:'Presentation could not be verified'});
      }
    });
  }
  return {adapter,mount,memberships,refreshAll,clientId,responseUri,close(){clearInterval(timer);db.close();}};
}
