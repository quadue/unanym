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
const short=text=>createHash('sha256').update(text).digest('base64url').slice(0,16);
const hash=text=>createHash('sha256').update(text).digest('hex');
const cookie=req=>String(req.headers.cookie??'').split(';').map(c=>c.trim()).find(c=>c.startsWith('unanym_wallet_browser='))?.split('=')[1]??'';

export function createWalletBridge(config,{trust,maxStatusAge=60,refreshMs=15_000,requestTtl=300_000,fetchImpl=fetch,now=Date.now}) {
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

  const cacheKey=(issuer,uri)=>issuer+'\0'+uri;
  async function refresh(issuer,uri) {
    const signer=trust.find(t=>t.issuer===issuer);
    if(!signer)return;
    try{
      const response=await fetchImpl(uri,{signal:AbortSignal.timeout(5000),headers:{Accept:'application/statuslist+jwt'}});
      if(!response.ok)throw new Error('status '+response.status);
      const entry=await verifyStatusList(await response.text(),{uri,publicJwk:signer.statusJwk??signer.publicJwk,alg:signer.alg,maxAge:maxStatusAge,now:now()});
      const key=cacheKey(issuer,uri),previous=statusCache.get(key);
      // A delayed refresh must not replace newer evidence with an older list.
      if(!previous||entry.issuedAt>=previous.issuedAt)statusCache.set(key,{...entry,fetchedAt:now()});
    }catch{/* A failed refresh leaves the previous entry to age out and fail closed. */}
  }
  const refreshAll=()=>Promise.all(db.prepare('SELECT DISTINCT issuer,status_uri FROM wallet_credentials WHERE status_uri IS NOT NULL').all().map(r=>refresh(r.issuer,r.status_uri)));
  const timer=setInterval(refreshAll,refreshMs);timer.unref();

  // Current only if unexpired, and its status list is verified, fresh and valid.
  function deadline(row) {
    const entry=statusCache.get(cacheKey(row.issuer,row.status_uri));
    return entry?Math.min(row.expires??Infinity,entry.expiresAt??Infinity,entry.issuedAt+maxStatusAge*1000,entry.fetchedAt+maxStatusAge*1000):0;
  }
  function current(row) {
    if(deadline(row)<=now())return false;
    if(!row.status_uri)return false;
    const entry=statusCache.get(cacheKey(row.issuer,row.status_uri));
    if(!entry)return false;
    try{return readStatus(entry.list,row.status_idx)===STATUS_VALID;}catch{return false;}
  }

  function memberships(accountId) {
    return db.prepare('SELECT * FROM wallet_credentials WHERE account=?').all(accountId).filter(row=>current(row)).map(row=>({
      slug:'wallet-'+short(row.issuer+'\0'+row.organisation_id),name:row.organisation_name,
      organisation:{id:row.organisation_id,name:row.organisation_name},
      // Linking is not an organisation approval. Exact deadlines stay internal;
      // the site receives only a short-lived operator statement, not credential dates.
      approvedAt:null,linkedAt:new Date(row.linked_at).toISOString(),validUntil:row.expires?new Date(row.expires).toISOString():null,
      statementExpiresAt:deadline(row),authorityMode:'wallet_verified'}));
  }
  function adapter(inner) {
    return {...inner,walletMemberships:true,memberships(id){return [...inner.memberships(id),...(inner.account(id)?memberships(id):[])];}};
  }

  function mount(app,{session,csrfBinding}) {
    if(typeof csrfBinding!=='function')throw new Error('Wallet linking requires the account session binding');
    const completePath=base+'/wallet/complete';
    function completion(req,res) {
      // Keep the return code out of Referer while preserving the browser's
      // same-origin form Origin header (no-referrer can make it "null").
      res.set({'Cache-Control':'no-store','Referrer-Policy':'origin'});
      const state=String(req.method==='POST'?req.body.state:req.query.state??'');
      const code=String(req.method==='POST'?req.body.response_code:req.query.response_code??'');
      const pending=requests.get(state),user=session(req);
      if(!pending?.proof||pending.expires<=now()||!code||hash(code)!==pending.responseHash||!user||user.id!==pending.account||
        hash(cookie(req)+'\0'+csrfBinding(req))!==pending.browser){
        res.status(403).send(page('Start again in this browser',`<section class="narrow"><h1>Start again in this browser</h1><p>No membership was added. Open your wallet from your own signed-in account, and return to the same browser.</p><a href="${base}/wallet">Back to your account</a></section>`,config));
        return null;
      }
      return {state,code,pending};
    }
    app.get(base+'/wallet',(req,res)=>{
      const user=session(req);
      if(!user)return res.redirect(config.loginPath?.(req.path)??'/');
      const state=randomBytes(24).toString('base64url'),nonce=randomBytes(24).toString('base64url');
      for(const [key,value] of requests)if(value.expires<=now())requests.delete(key);
      if(requests.size>=1000)return res.status(429).send('Please try again shortly.');
      const browser=randomBytes(32).toString('hex');
      res.cookie('unanym_wallet_browser',browser,{httpOnly:true,sameSite:'lax',secure:config.origin.startsWith('https:'),path:base+'/wallet',maxAge:requestTtl});
      requests.set(state,{nonce,account:user.id,browser:hash(browser+'\0'+csrfBinding(req)),expires:now()+requestTtl});
      const request='openid4vp://?'+new URLSearchParams({client_id:clientId,response_type:'vp_token',response_mode:'direct_post',
        response_uri:responseUri,nonce,state,dcql_query:JSON.stringify(dcql),
        client_metadata:JSON.stringify({vp_formats_supported:{'dc+sd-jwt':{'sd-jwt_alg_values':['ES256'],'kb-jwt_alg_values':['ES256','EdDSA']}}})});
      const rows=db.prepare('SELECT * FROM wallet_credentials WHERE account=?').all(user.id);
      res.send(page('Add from your wallet',`<section class="narrow"><p class="eyebrow">Experimental</p><h1>Add a membership from your wallet</h1>
        <p class="lead small">Use a wallet on this device, then return to this browser to confirm. Your name is not requested.</p><p>Other devices and browsers are not supported in this experiment.</p>
        <div class="actions"><a class="button" id="wallet-request" href="${escape(request)}">Open in your wallet</a></div>
        <h2>Linked from a wallet</h2>${rows.length?'<ul>'+rows.map(r=>`<li>${escape(r.organisation_name)} · ${current(r)?'current':'not currently confirmed'}</li>`).join('')+'</ul>':'<p>None yet.</p>'}</section>`,config));
    });
    app.post(base+'/wallet/response',express.urlencoded({extended:false,limit:'96kb'}),async(req,res)=>{
      const pending=requests.get(String(req.body.state??''));
      if(!pending||pending.received||pending.expires<=now())return res.status(400).json({error:'invalid_request',error_description:'Unknown, used or expired request'});
      pending.received=true;
      try{
        const token=JSON.parse(String(req.body.vp_token??''));
        const values=token?.membership,presentation=Array.isArray(values)?values[0]:values;
        const proof=await verifyPresentation(presentation,{trust,audience:clientId,nonce:pending.nonce,now:now()});
        if(proof.claims.membership!=='member')throw Object.assign(new Error('Not a membership'),{name:'PresentationError'});
        // Do not bind or replace a credential on a back-channel response. Only
        // the wallet learns this one-time code; the originating browser must
        // receive it and explicitly confirm using its original account session.
        pending.proof=proof;
        const code=randomBytes(32).toString('base64url');pending.responseHash=hash(code);
        res.json({redirect_uri:config.origin+completePath+'?'+new URLSearchParams({state:req.body.state,response_code:code})});
      }catch(error){
        requests.delete(String(req.body.state??''));
        res.status(400).json({error:'invalid_request',error_description:error.name==='PresentationError'||error.name==='StatusListError'?error.message:'Presentation could not be verified'});
      }
    });
    app.get(completePath,(req,res)=>{
      const result=completion(req,res);if(!result)return;
      const {state,code,pending}=result;
      res.send(page('Confirm membership',`<section class="narrow"><h1>Add this membership?</h1><p>${escape(pending.proof.claims.organisation_name??pending.proof.claims.organisation_id)}</p><p>Add it to the account you used to open your wallet. Nothing is shared with a website until you choose it there.</p><form method="post" action="${completePath}"><input type="hidden" name="state" value="${escape(state)}"><input type="hidden" name="response_code" value="${escape(code)}"><button type="submit">Add membership</button></form><a href="${base}/wallet">Cancel</a></section>`,config));
    });
    app.post(completePath,express.urlencoded({extended:false,limit:'4kb'}),async(req,res)=>{
      if(req.headers.origin!==config.origin)return res.sendStatus(403);
      const result=completion(req,res);if(!result)return;
      const {state,pending}=result,proof=pending.proof;
      requests.delete(state);
      if(proof.status?.uri)await refresh(proof.issuer,proof.status.uri);
      if(pending.expires<=now()||session(req)?.id!==pending.account||hash(cookie(req)+'\0'+csrfBinding(req))!==pending.browser)return res.sendStatus(403);
      const row={issuer:proof.issuer,status_uri:proof.status?.uri,status_idx:proof.status?.idx,expires:proof.expiresAt};
      if(!current(row))return res.status(409).send('This membership cannot currently be confirmed. No membership was added.');
      db.prepare(`INSERT INTO wallet_credentials VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(account,issuer,organisation_id) DO UPDATE SET
        organisation_name=excluded.organisation_name,holder=excluded.holder,status_uri=excluded.status_uri,status_idx=excluded.status_idx,expires=excluded.expires,linked_at=excluded.linked_at`)
        .run(pending.account,proof.issuer,proof.claims.organisation_id,String(proof.claims.organisation_name??proof.claims.organisation_id).slice(0,120),
          proof.holderThumbprint,proof.status.uri,proof.status.idx,proof.expiresAt,now());
      res.clearCookie('unanym_wallet_browser',{path:base+'/wallet'});
      res.redirect(303,base+'/wallet');
    });
  }
  return {adapter,mount,memberships,refreshAll,clientId,responseUri,close(){clearInterval(timer);db.close();}};
}
