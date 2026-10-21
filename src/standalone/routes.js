import express from 'express';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {accountCookie} from './accounts.js';
import {page,escape} from '../views.js';
import {displayName,memberPage} from '../presentation.js';

export function standaloneRoutes(app,config,accounts,passkeys) {
  const secure=new URL(config.origin).protocol==='https:';
  const bindingName=secure?'__Host-community_login':'community_login';
  const body=express.urlencoded({extended:false,limit:'12kb'});
  const json=express.json({limit:'32kb',strict:true});
  const safeNext=value=>typeof value==='string'&&value.startsWith('/identity/')&&!value.includes('\\')&&!/[\x00-\x1f]/.test(value)&&value.length<1000?value:'/identity/account';
  const bind=req=>accountCookie(req,bindingName);
  const accountBinding=req=>accountCookie(req,accounts.cookieName);
  const token=(req,path)=>createHmac('sha256',config.keys.cookie).update((accountBinding(req)||bind(req))+'\0'+path).digest('hex');
  const hidden=(req,path)=>`<input type="hidden" name="csrf" value="${token(req,path)}">`;
  function protect(req,res,next){
    const expected=token(req,req.path),actual=req.body?.csrf;
    if(req.headers.origin!==config.origin||!(accountBinding(req)||bind(req))||typeof actual!=='string'||!/^[a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(403).send('Return to the form and try again.');
    next();
  }
  const view=(res,title,html)=>res.send(page(title,`<section class="narrow"><h1>${escape(title)}</h1>${html}</section>`,config));
  const accessView=(res,title,html)=>res.send(memberPage(config,title,`<section class="member-access"><h1>${escape(title)}</h1>${html}</section>`,{access:true}));
  const securityView=(req,res,title,html)=>res.send(memberPage(config,title,`<section class="member-access"><h1>${escape(title)}</h1>${html}</section>`,{csrf:path=>token(req,path),canSignOut:true}));
  const field=(label,name,type='text',required=true)=>`<label>${label}<input name="${name}" type="${type}" ${required?'required':''}></label>`;
  function user(req,res){const value=accounts.adapter.session(req);if(!value)res.redirect('/identity/login?next='+encodeURIComponent(req.path));return value;}
  function setSession(req,res,session){
    accounts.logout(req);res.cookie(accounts.cookieName,session.token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:session.expires-Date.now()});
    res.clearCookie(bindingName,{path:'/',httpOnly:true,secure,sameSite:'lax'});
  }
  function signIn(req,res,session,next){setSession(req,res,session);res.redirect(303,next);}
  const passkeyScript=`<script type="module" src="/identity/assets/passkeys.js"></script>`;
  const passkeyForm=(req,kind,next='/identity/account')=>passkeys.enabled?`<form data-passkey="${kind}" hidden><input type="hidden" name="csrf" value="${token(req,'/identity/passkeys/'+kind+'/options')}"><input type="hidden" name="verify_csrf" value="${token(req,'/identity/passkeys/'+kind+'/verify')}"><input type="hidden" name="next" value="${escape(next)}">${kind==='register'?'<label>Passkey name<input name="label" maxlength="60" value="My passkey" required></label>':''}<button type="submit">${kind==='register'?'Add a passkey':kind==='confirm'?'Confirm with a passkey':'Sign in with a passkey'}</button><p class="help" role="status" aria-live="polite"></p></form>`:'';
  function codeForm(req,res,id,next,message='Check your email for an eight-digit code.'){
    return accessView(res,'Enter your code',`<p>${escape(message)}</p><form method="post" action="/identity/login/verify">${hidden(req,'/identity/login/verify')}<input type="hidden" name="challenge" value="${escape(id)}"><input type="hidden" name="next" value="${escape(next)}"><label>Sign-in code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required></label><button>Sign in</button></form><form class="code-resend" method="post" action="/identity/login/resend">${hidden(req,'/identity/login/resend')}<input type="hidden" name="challenge" value="${escape(id)}"><input type="hidden" name="next" value="${escape(next)}"><button>Send another code</button></form><p><a href="/identity/login?next=${encodeURIComponent(next)}">Back to sign-in</a></p>`);
  }
  app.get('/',(_req,res)=>res.redirect(303,'/identity/account'));
  app.get('/identity/login',(req,res)=>{
    if(accounts.adapter.session(req))return res.redirect(303,safeNext(req.query.next));
    if(!/^[A-Za-z0-9_-]{43}$/.test(bind(req))){const value=randomBytes(32).toString('base64url');res.cookie(bindingName,value,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:600_000});req.headers.cookie=(req.headers.cookie?req.headers.cookie+'; ':'')+bindingName+'='+value;}
    accessView(res,'Your '+displayName(config),`<p>Enter your email to receive a code. Confirm it to create your account or sign in to the one you already have.</p><p class="help">Your email stays here. Websites receive only what you choose to share.</p><form method="post" action="/identity/login/request">${hidden(req,'/identity/login/request')}<input type="hidden" name="next" value="${escape(safeNext(req.query.next))}"><label>Email address<input name="email" type="email" autocomplete="email" required></label><button>Send code</button></form>${passkeyForm(req,'login',safeNext(req.query.next))}<p class="help">A new account starts with no connections. Communities approve memberships separately.</p>${passkeyScript}`);
  });
  app.post('/identity/login/request',body,protect,async(req,res)=>{
    try{const id=await accounts.requestCode(req.body.email,bind(req),req.ip);codeForm(req,res,id,safeNext(req.body.next));}
    catch(e){res.status(e.status??400);accessView(res,'Sign-in needs another try',`<p>${escape(e.message)}</p><a href="/identity/login">Return to sign-in</a>`);}
  });
  app.post('/identity/login/resend',body,protect,async(req,res)=>{
    const next=safeNext(req.body.next);
    try{const id=await accounts.resendCode(req.body.challenge,bind(req),req.ip);codeForm(req,res,id,next,'Another code was sent. Earlier codes still work until this request expires.');}
    catch(e){res.status(e.status??400);codeForm(req,res,req.body.challenge??'',next,e.message);}
  });
  app.post('/identity/login/verify',body,protect,(req,res)=>{
    const next=safeNext(req.body.next);
    try{
      const session=accounts.verifyCode(req.body.challenge,req.body.code,bind(req));
      signIn(req,res,session,next);
    }catch(e){res.status(400);codeForm(req,res,req.body.challenge??'',next,e.message);}
  });
  app.post('/identity/logout',body,protect,(req,res)=>{accounts.logout(req);res.clearCookie(accounts.cookieName,{path:'/',httpOnly:true,secure,sameSite:'lax'});res.redirect(303,'/identity/login');});
  app.get('/identity/security',(req,res)=>{
    const u=user(req,res);if(!u)return;
    const keys=passkeys.list(u.id),fresh=accounts.isFresh(req);
    securityView(req,res,'Passkeys',`<p>Use your phone, computer or security key to sign in to this account.</p>${keys.length?`<ul class="member-passkeys">${keys.map(k=>`<li><strong>${escape(k.name)}</strong><small>${k.last_used?'Last used '+escape(k.last_used.slice(0,10)):'Added '+escape(k.created.slice(0,10))}</small>${fresh?`<form method="post" action="/identity/passkeys/remove">${hidden(req,'/identity/passkeys/remove')}<input type="hidden" name="credential" value="${escape(k.id)}"><button>Remove ${escape(k.name)}</button></form>`:''}</li>`).join('')}</ul>`:'<p class="help">No passkeys added yet.</p>'}
      ${fresh?passkeyForm(req,'register'):`<p class="help">Confirm your account before adding or removing a passkey.</p>${keys.length?passkeyForm(req,'confirm'):''}<form method="post" action="/identity/security/request">${hidden(req,'/identity/security/request')}<button>Send a confirmation code</button></form>`}
      <noscript><p class="help">Adding a passkey needs JavaScript. Email codes remain available.</p></noscript>
      <details><summary>Recovery &amp; privacy</summary><p class="help">Email codes still work. Removing a passkey stops future sign-ins with it; existing signed-in sessions continue until sign-out or expiry. Your passkey provider may sync keys through its cloud. A security key lets you keep one on the device. Website identities and records remain held by the operator.</p></details><p><a href="/identity/account">Back to your account</a></p>${passkeyScript}`);
  });
  function confirmationForm(req,res,id,message='Enter the code sent to your account email.'){
    securityView(req,res,'Confirm your account',`<p>${escape(message)}</p><form method="post" action="/identity/security/verify">${hidden(req,'/identity/security/verify')}<input type="hidden" name="challenge" value="${escape(id)}"><label>Confirmation code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required></label><button>Confirm account</button></form><form class="code-resend" method="post" action="/identity/security/resend">${hidden(req,'/identity/security/resend')}<input type="hidden" name="challenge" value="${escape(id)}"><button>Send another code</button></form><a href="/identity/security">Back to passkeys</a>`);
  }
  app.post('/identity/security/request',body,protect,async(req,res)=>{
    const u=user(req,res);if(!u)return;
    try{const id=await accounts.requestCode(accounts.memberDetails(u.id).email,accountBinding(req),req.ip);confirmationForm(req,res,id);}
    catch(e){res.status(e.status??400);securityView(req,res,'Could not send a code',`<p>${escape(e.message)}</p><a href="/identity/security">Back to passkeys</a>`);}
  });
  app.post('/identity/security/resend',body,protect,async(req,res)=>{
    const u=user(req,res);if(!u)return;
    try{const id=await accounts.resendCode(req.body.challenge,accountBinding(req),req.ip,u.id);confirmationForm(req,res,id,'Another code was sent. Earlier codes still work until this request expires.');}
    catch(e){res.status(e.status??400);confirmationForm(req,res,req.body.challenge??'',e.message);}
  });
  app.post('/identity/security/verify',body,protect,(req,res)=>{
    const u=user(req,res);if(!u)return;
    try{signIn(req,res,accounts.verifyAccountCode(req.body.challenge,req.body.code,accountBinding(req),u.id),'/identity/security');}
    catch(e){res.status(400);confirmationForm(req,res,req.body.challenge??'',e.message);}
  });
  function passkeyUser(req,res){
    const u=accounts.adapter.session(req);
    if(!u||!accounts.isFresh(req)){res.status(403).json({error:'Confirm your account on the passkeys page before making this change.'});return null;}
    return u;
  }
  const error=(res,e)=>res.status(e.status??400).json({error:e.message});
  app.post('/identity/passkeys/register/options',json,protect,async(req,res)=>{
    const u=passkeyUser(req,res);if(!u)return;
    try{res.json(await passkeys.registrationOptions(u.id,accountBinding(req),req.ip));}catch(e){error(res,e);}
  });
  app.post('/identity/passkeys/register/verify',json,protect,async(req,res)=>{
    const u=passkeyUser(req,res);if(!u)return;
    try{await passkeys.register(u.id,req.body.challenge,req.body.response,accountBinding(req),req.body.label);res.json({next:'/identity/security'});}catch(e){error(res,e);}
  });
  app.post('/identity/passkeys/login/options',json,protect,async(req,res)=>{
    if(accounts.adapter.session(req))return res.status(409).json({error:'You are already signed in.'});
    try{res.json(await passkeys.authenticationOptions(bind(req),req.ip));}catch(e){error(res,e);}
  });
  app.post('/identity/passkeys/login/verify',json,protect,async(req,res)=>{
    if(accounts.adapter.session(req))return res.status(409).json({error:'You are already signed in.'});
    try{const session=await passkeys.authenticate(req.body.challenge,req.body.response,bind(req));setSession(req,res,session);res.json({next:safeNext(req.body.next)});
    }catch(e){error(res,e);}
  });
  function confirmationUser(req,res){
    const u=accounts.adapter.session(req);if(!u)res.status(401).json({error:'Sign in again before confirming your account.'});return u;
  }
  app.post('/identity/passkeys/confirm/options',json,protect,async(req,res)=>{
    const u=confirmationUser(req,res);if(!u)return;
    try{res.json(await passkeys.authenticationOptions(accountBinding(req),req.ip,u.id));}catch(e){error(res,e);}
  });
  app.post('/identity/passkeys/confirm/verify',json,protect,async(req,res)=>{
    const u=confirmationUser(req,res);if(!u)return;
    try{const session=await passkeys.authenticate(req.body.challenge,req.body.response,accountBinding(req),u.id);setSession(req,res,session);res.json({next:'/identity/security'});}
    catch(e){error(res,e);}
  });
  app.post('/identity/passkeys/remove',body,protect,(req,res)=>{
    const u=user(req,res);if(!u)return;
    if(!accounts.isFresh(req))return res.redirect(303,'/identity/security');
    try{passkeys.remove(u.id,req.body.credential);res.redirect(303,'/identity/security');}
    catch(e){res.status(400);securityView(req,res,'Could not remove passkey',`<p>${escape(e.message)}</p><a href="/identity/security">Back to passkeys</a>`);}
  });
  app.get('/identity/operator',(req,res)=>{
    const u=user(req,res);if(!u)return;if(!accounts.isOperator(u.id))return res.sendStatus(403);
    view(res,'Register an organisation',`<p>Record the actual authorisation before assigning its administrator. The service operator will attest to their approvals.</p><form method="post" action="/identity/operator/organisations">${hidden(req,'/identity/operator/organisations')}${field('Organisation name','name')}${field('Administrator email','admin_email','email')}${field('Authorisation reference','authority_note')}<button>Register organisation</button></form>`);
  });
  app.post('/identity/operator/organisations',body,protect,(req,res)=>{
    const u=user(req,res);if(!u)return;
    try{accounts.createOrganisation(u.id,{name:req.body.name,adminEmail:req.body.admin_email,authorityNote:req.body.authority_note});res.redirect(303,'/identity/account');}
    catch(e){res.status(e.status??400);view(res,'Could not register',`<p>${escape(e.message)}</p>`);}
  });
  app.get('/identity/organisations/:org',(req,res)=>{
    const u=user(req,res);if(!u)return;const org=accounts.organisations(u.id).find(o=>o.id===req.params.org);if(!org)return res.sendStatus(403);
    const path='/identity/organisations/'+encodeURIComponent(org.id),members=accounts.listMembers(u.id,org.id);
    view(res,org.name,`<p>You approve membership for this organisation. The operator signs these records. This does not certify training.</p><details><summary>Connect a website</summary><p>Give the website administrator this stable organisation ID:</p><code>${escape(org.id)}</code></details><form method="post" action="${path}/approve">${hidden(req,path+'/approve')}${field('Member email','email','email')}${field('Expiry (optional)','expires','date',false)}<button>Approve membership</button></form><h2>Member records</h2>${members.map(m=>`<article class="connection"><strong>${escape(m.email)}</strong><p>${escape(m.status)}${m.valid_until?' · expires '+escape(m.valid_until):''}</p>${m.status==='active'?`<form method="post" action="${path}/revoke">${hidden(req,path+'/revoke')}<input type="hidden" name="membership" value="${escape(m.id)}"><button class="secondary">Revoke membership</button></form>`:''}</article>`).join('')}<details><summary>Community introductions</summary><p>Confirm that a member completed this organisation’s introduction. This is separate from membership and does not certify training or safety.</p>${members.filter(m=>m.status==='active').map(m=>{const c=accounts.db.prepare('SELECT revoked_at FROM introductions WHERE membership=?').get(m.id),confirmed=c&&c.revoked_at===null,action=confirmed?'withdraw-introduction':'confirm-introduction';return `<form method="post" action="${path}/${action}">${hidden(req,path+'/'+action)}<input type="hidden" name="membership" value="${escape(m.id)}"><p>${escape(m.email)} · Introduction</p><button class="secondary">${confirmed?'Withdraw confirmation':'Confirm introduction'}</button></form>`;}).join('')}</details><a href="/identity/account">Back to account</a>`);
  });
  for(const action of ['approve','revoke','confirm-introduction','withdraw-introduction'])app.post('/identity/organisations/:org/'+action,body,protect,(req,res)=>{
    const u=user(req,res);if(!u)return;
    try{if(action==='approve')accounts.approve(u.id,req.params.org,req.body.email,req.body.expires?req.body.expires+'T23:59:59.000Z':null);else if(action==='revoke')accounts.revoke(u.id,req.params.org,req.body.membership);else accounts.confirmIntroduction(u.id,req.params.org,req.body.membership,action==='confirm-introduction');res.redirect(303,'/identity/organisations/'+encodeURIComponent(req.params.org));}
    catch(e){res.status(e.status??400);view(res,'Membership unchanged',`<p>${escape(e.message)}</p>`);}
  });
}
