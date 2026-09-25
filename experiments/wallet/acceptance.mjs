// Wallet experiment acceptance run against real walt.id Issuer2 + Wallet API v2
// (OpenID4VCI 1.0 / OpenID4VP 1.0, SD-JWT VC), this repository's Unanym, a
// fictional organisation status list and two fictional websites.
// Prerequisites: experiments/wallet/README.md. Prints a JSON evidence record.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {decodeJwt} from 'jose';

const UNANYM='http://localhost:7010',ISSUER='http://127.0.0.1:7005',WALLET='http://127.0.0.1:7006',STATUS='http://localhost:7012';
const evidence={date:new Date().toISOString(),checks:[],measurements:{}};
const check=(name,ok,detail)=>{evidence.checks.push({name,ok:Boolean(ok),...(detail?{detail}:{})});if(!ok)console.error('FAILED:',name,detail??'');};
const json=async(method,url,body)=>{const r=await fetch(url,{method,headers:{'Content-Type':'application/json',Accept:'application/json'},body:body&&JSON.stringify(body)});const t=await r.text();try{return {status:r.status,body:JSON.parse(t)};}catch{return {status:r.status,body:t};}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function newWalletWithCredential(idx) {
  const wallet=(await json('POST',WALLET+'/wallet',{})).body.walletId;
  await json('POST',`${WALLET}/wallet/${wallet}/keys/generate`,{backend:'jwk'});
  const offer=(await json('POST',ISSUER+'/issuer2/credential-offers',{profileId:'communityMembership',authMethod:'PRE_AUTHORIZED',valueMode:'BY_VALUE',
    runtimeOverrides:{credentialStatus:{status_list:{idx,uri:STATUS+'/status/lakeside/1'}}}})).body;
  const received=await json('POST',`${WALLET}/wallet/${wallet}/credentials/receive`,{offerUrl:offer.credentialOffer});
  const [id]=received.body.credentialIds;
  const stored=(await json('GET',`${WALLET}/wallet/${wallet}/credentials/${id}`)).body;
  const raw=JSON.stringify(stored).match(/ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:~[A-Za-z0-9_-]*)*/)[0];
  return {wallet,credential:decodeJwt(raw.split('~')[0]),raw};
}
async function signIn(context,account) {
  const page=await context.newPage();
  await page.request.post(UNANYM+'/demo/login',{form:{account,next:'/identity/'},maxRedirects:0});
  return page;
}
async function walletRequest(page) {
  await page.goto(UNANYM+'/identity/wallet');
  return page.locator('#wallet-request').getAttribute('href');
}
// Each fictional website: a callback that exchanges the code server-side (PKCE) and reads UserInfo.
function website(clientId,host,port) {
  let pending,latest;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,`http://${host}:${port}`);
    const discovery=await (await fetch(UNANYM+'/identity/oidc/.well-known/openid-configuration')).json();
    const tokens=await (await fetch(discovery.token_endpoint,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,
      redirect_uri:`http://${host}:${port}/cb`,code:url.searchParams.get('code')??'',code_verifier:pending})})).json();
    latest={tokens,discovery};res.end('ok');
  }).listen(port,host==='localhost'?'127.0.0.1':host);
  return {
    async connect(page,{name,share=true}) {
      pending=randomBytes(32).toString('base64url');
      const discovery=await (await fetch(UNANYM+'/identity/oidc/.well-known/openid-configuration')).json();
      const auth=new URL(discovery.authorization_endpoint);
      auth.search=new URLSearchParams({client_id:clientId,redirect_uri:`http://${host}:${port}/cb`,response_type:'code',scope:'openid profile identity.v1 memberships.v1',
        state:'s',nonce:'n',prompt:'consent',code_challenge:createHash('sha256').update(pending).digest('base64url'),code_challenge_method:'S256'});
      await page.goto(auth.href);
      await page.getByLabel('Your name on this website').fill(name);
      const box=page.getByRole('checkbox',{name:/Lakeside Association/});
      if(await box.count())share?await box.check():await box.uncheck();
      await page.getByRole('button',{name:'Allow and continue'}).click();
      await page.waitForURL(`http://${host}:${port}/cb**`);
    },
    async userinfo() {
      const r=await fetch(latest.discovery.userinfo_endpoint,{headers:{Authorization:'Bearer '+latest.tokens.access_token}});
      return r.ok?r.json():{status:r.status};
    },
    close(){server.close();}
  };
}
const statements=info=>(info.memberships_v1?.statements??[]).map(t=>decodeJwt(t));
const values=(node,out=new Set())=>{if(node&&typeof node==='object')Object.values(node).forEach(v=>values(v,out));else if(node!==undefined&&node!==null)out.add(String(node));return out;};

const browser=await chromium.launch();
const siteA=website('site-a','localhost',7021),siteB=website('site-b','127.0.0.1',7022);
try{
  // 1. Independent issuer -> existing wallet.
  const first=await newWalletWithCredential(5);
  check('independent issuer delivered an SD-JWT VC to the existing wallet',first.credential.vct?.endsWith('/community_membership'));

  // 2. Wallet -> Unanym verification, selective disclosure, linked to the signed-in account.
  const context=await browser.newContext();const robin=await signIn(context,'robin');
  const request=await walletRequest(robin);
  const presented=await json('POST',`${WALLET}/wallet/${first.wallet}/credentials/present`,{requestUrl:request});
  check('the wallet presented to Unanym over OpenID4VP 1.0',presented.body?.transmission_success===true,presented.body);
  const captured=await (await fetch(UNANYM+'/experiment/last-presentation')).json();
  const disclosed=captured.disclosed??[];
  check('only requested claims were disclosed (member name withheld)',disclosed.includes('membership')&&!disclosed.includes('member_name'),disclosed);
  await robin.goto(UNANYM+'/identity/wallet');
  check('membership linked to the signed-in account',(await robin.content()).includes('Lakeside Association · current'));

  // 3. Replay of the same response, and replay into a new request, both fail.
  const replay=await fetch(UNANYM+'/identity/wallet/response',{method:'POST',body:new URLSearchParams(captured.form)});
  check('replaying the same response is refused',replay.status===400);
  const fresh=new URL((await walletRequest(robin)).replace('openid4vp://','https://x/'));
  const intoNew=await fetch(UNANYM+'/identity/wallet/response',{method:'POST',body:new URLSearchParams({...captured.form,state:fresh.searchParams.get('state')})});
  check('a captured presentation replayed into a new request is refused',intoNew.status===400,await intoNew.text());

  // 4. Two websites receive separate results.
  await siteA.connect(robin,{name:'Robin'});await siteB.connect(robin,{name:'R.'});
  const a=await siteA.userinfo(),b=await siteB.userinfo();
  const [sa]=statements(a),[sb]=statements(b);
  check('both websites receive the wallet-verified membership',sa?.organisation?.id==='urn:example:lakeside-association'&&sb?.authority?.mode==='wallet_verified');
  check('websites receive different subjects',a.sub&&b.sub&&a.sub!==b.sub);
  // Values that can only come from the credential. Unanym's own per-site timestamps can coincide by chance.
  const signature=first.raw.split('~')[0].split('.')[2];
  const credentialValues=new Set([...values({cnf:first.credential.cnf,sd:first.credential._sd,status:first.credential.status}),signature,String(first.credential.exp)]);
  const received=[...values({a,sa}),...values({b,sb})];
  const leaked=received.filter(v=>credentialValues.has(v)||(v.length>20&&first.raw.includes(v)));
  check('no holder key, credential signature, status reference or credential timestamp reaches either website',leaked.length===0,leaked);
  const allowed=new Set(['1','member','active','wallet_verified','urn:example:lakeside-association','Lakeside Association',UNANYM+'/identity/oidc','operator','Experiment operator']);
  const common=[...values({a,sa})].filter(v=>values({b,sb}).has(v)&&!allowed.has(v));
  evidence.measurements.common_values_between_websites=common;

  // 5. Withdrawal: organisation revokes; measure until site A's current UserInfo stops sharing it.
  const t0=Date.now();await fetch(STATUS+'/admin/revoke/5',{method:'POST'});
  let closedAfter=null;
  for(let i=0;i<60;i++){if(!statements(await siteA.userinfo()).length){closedAfter=Date.now()-t0;break;}await sleep(1000);}
  evidence.measurements.withdrawal_to_denial_ms=closedAfter;
  check('organisation withdrawal closes future access within the bound (refresh 5 s)',closedAfter!==null&&closedAfter<=7000,closedAfter);
  await fetch(STATUS+'/admin/reinstate/5',{method:'POST'});

  // 6. Member withdraws sharing consent for one website only.
  await siteB.connect(robin,{name:'R.',share:false});
  check('withdrawing sharing consent stops that website only',!statements(await siteB.userinfo()).length);

  // 7. Wallet replacement: a new wallet and credential keep the existing website account.
  await sleep(6000);
  const second=await newWalletWithCredential(6);
  const renewed=await json('POST',`${WALLET}/wallet/${second.wallet}/credentials/present`,{requestUrl:await walletRequest(robin)});
  await siteA.connect(robin,{name:'Robin'});
  const after=await siteA.userinfo();
  check('a replacement wallet and credential keep the same website account',renewed.body?.transmission_success===true&&after.sub===a.sub&&statements(after).length===1,{before:a.sub,after:after.sub});

  // 8. Status service outage fails closed within the freshness bound (20 s).
  await siteA.connect(robin,{name:'Robin'});
  const o0=Date.now();await fetch(STATUS+'/admin/outage/on',{method:'POST'});
  let outageClosed=null;
  for(let i=0;i<60;i++){if(!statements(await siteA.userinfo()).length){outageClosed=Date.now()-o0;break;}await sleep(1000);}
  await fetch(STATUS+'/admin/outage/off',{method:'POST'});
  evidence.measurements.status_outage_to_denial_ms=outageClosed;
  check('a status outage fails closed within the freshness bound (20 s + 5 s refresh)',outageClosed!==null&&outageClosed<=26000,outageClosed);

  // 9. A member without a wallet completes the ordinary hosted journey.
  const samContext=await browser.newContext();const sam=await signIn(samContext,'sam');
  await siteA.connect(sam,{name:'Sam'});
  const samInfo=await siteA.userinfo();
  check('a member without a wallet completes the hosted journey',samInfo.name==='Sam'&&samInfo.sub!==a.sub);
}finally{await browser.close();siteA.close();siteB.close();}
console.log(JSON.stringify(evidence,null,2));
process.exitCode=evidence.checks.every(c=>c.ok)?0:1;
