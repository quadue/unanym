import {UserManager,WebStorageStateStore} from 'oidc-client-ts';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {verifyEvent} from '../vendor/frrn-kernel/event-schema.js';
const $=id=>document.getElementById(id);
const config=await fetch('./client-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('config');return r.json();});
const origin=new URL(config.authority).origin;
for(const [id,path] of [['identity-home','/identity/'],['manage','/identity/sites'],['developer-link','/identity/developers']])$(id).href=origin+path;
const manager=new UserManager({authority:config.authority,client_id:config.client_id,redirect_uri:config.redirect_uri,
  response_type:'code',scope:'openid profile drop_identity drop_memberships',loadUserInfo:false,
  automaticSilentRenew:false,monitorSession:false,userStore:new WebStorageStateStore({store:sessionStorage}),stateStore:new WebStorageStateStore({store:sessionStorage})});
let user;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function signedOut(){user=null;$('signed-in').hidden=true;$('signed-out').hidden=false;}
async function proofValid(info){
  const proof=info.drop_membership_receipt;
  const keys=await fetch(origin+'/identity/keys',{cache:'no-store'}).then(r=>r.json());
  if(proof?.owner!==keys.public_key || proof?.body?.issuer!==config.authority || proof.body.subject!==info.sub || proof.body.audience!==config.client_id || !(Date.parse(proof.body.validUntil)>Date.now()))return false;
  const memberships=info.drop_memberships.map(({slug,name})=>({slug,name}));
  if(JSON.stringify(proof.body.memberships)!==JSON.stringify(memberships))return false;
  return verifyEvent(proof,async(pub,sig,payload)=>{
    const hex=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
    const {canon}=await import('../vendor/frrn-kernel/core.js');
    const key=await crypto.subtle.importKey('raw',hex(pub),{name:'Ed25519'},false,['verify']);
    return crypto.subtle.verify('Ed25519',key,hex(sig),canon(payload));
  });
}
async function check(){
  $('check').disabled=true;
  try{
    if(!user || user.expired)throw new Error('expired');
    const metadata=await manager.metadataService.getMetadata();
    // HTTPS OIDC response plus explicit signature, issuer and audience validation.
    await jwtVerify(user.id_token,createRemoteJWKSet(new URL(metadata.jwks_uri)),{issuer:config.authority,audience:config.client_id});
    const response=await fetch(metadata.userinfo_endpoint,{headers:{Authorization:'Bearer '+user.access_token},cache:'no-store'});
    if(!response.ok)throw new Error('disconnected');
    const info=await response.json();
    if(info.sub!==user.profile.sub || !await proofValid(info))throw new Error('verification');
    $('name').textContent=info.name;
    $('memberships').replaceChildren(...info.drop_memberships.map(m=>{const li=document.createElement('li');li.textContent=m.name;return li;}));
    $('no-memberships').hidden=info.drop_memberships.length!==0;
    $('received').textContent=JSON.stringify({issuer:config.authority,subject:info.sub,name:info.name,identity:info.drop_identity,memberships:info.drop_memberships,membership_signature:'Verified against FRRN’s published key; valid for five minutes'},null,2);
    $('signed-in').hidden=false;$('signed-out').hidden=true;status('Connected. This website can access only the information shown below.');
  }catch{
    await manager.removeUser();signedOut();status('Access is no longer available, or could not be verified. Connect again if you want to continue.',true);
  }finally{$('check').disabled=false;}
}
async function connect(){
  $('connect').disabled=true;status('Taking you to FRRN…');
  try{await manager.clearStaleState();await manager.signinRedirect({prompt:'consent'});}catch{status('Sign-in could not start. Please try again.',true);$('connect').disabled=false;}
}
$('connect').addEventListener('click',connect);$('change').addEventListener('click',connect);$('check').addEventListener('click',check);
$('forget').addEventListener('click',async()=>{await manager.removeUser();signedOut();status('Signed out of this trial. Your FRRN account and sharing permission are unchanged.');});
try{
  const query=new URLSearchParams(location.search);
  if(query.has('code') || query.has('error')){
    try{user=await manager.signinRedirectCallback();}finally{history.replaceState({},'',location.pathname);}
  }else user=await manager.getUser();
  if(user)await check();else{signedOut();status('Ready when you are. You choose what to share.');}
}catch{
  await manager.removeUser();signedOut();status('This connection was cancelled or could not be verified. You can try again.',true);
}
