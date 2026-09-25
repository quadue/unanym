import express from 'express';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {accountCookie} from './accounts.js';
import {page,escape} from '../views.js';
import {frontPage} from '../presentation.js';

export function standaloneRoutes(app,config,accounts) {
  const secure=new URL(config.origin).protocol==='https:';
  const bindingName=secure?'__Host-community_login':'community_login';
  const body=express.urlencoded({extended:false,limit:'12kb'});
  const safeNext=value=>typeof value==='string'&&value.startsWith('/identity/')&&!value.includes('\\')&&!/[\x00-\x1f]/.test(value)&&value.length<1000?value:'/identity/account';
  const bind=req=>accountCookie(req,bindingName);
  const accountBinding=req=>accountCookie(req,accounts.cookieName);
  const token=(req,path)=>createHmac('sha256',config.keys.cookie).update((accountBinding(req)||bind(req))+'\0'+path).digest('hex');
  const hidden=(req,path)=>`<input type="hidden" name="csrf" value="${token(req,path)}">`;
  function protect(req,res,next){
    const expected=token(req,req.path),actual=req.body.csrf;
    if(req.headers.origin!==config.origin||!(accountBinding(req)||bind(req))||typeof actual!=='string'||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(403).send('Return to the form and try again.');
    next();
  }
  const view=(res,title,html)=>res.send(page(title,`<section class="narrow"><h1>${escape(title)}</h1>${html}</section>`,config));
  const field=(label,name,type='text',required=true)=>`<label>${label}<input name="${name}" type="${type}" ${required?'required':''}></label>`;
  function user(req,res){const value=accounts.adapter.session(req);if(!value)res.redirect('/identity/login?next='+encodeURIComponent(req.path));return value;}
  function codeForm(req,res,id,next,message='Check your email for an eight-digit code.'){
    return view(res,'Enter your code',`<p>${escape(message)}</p><form method="post" action="/identity/login/verify">${hidden(req,'/identity/login/verify')}<input type="hidden" name="challenge" value="${escape(id)}"><input type="hidden" name="next" value="${escape(next)}"><label>Sign-in code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required></label><button>Sign in</button></form><p><a href="/identity/login?next=${encodeURIComponent(next)}">Request another code</a></p>`);
  }
  app.get('/',(_req,res)=>res.send(frontPage(config)));
  app.get('/identity/login',(req,res)=>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(bind(req))){const value=randomBytes(32).toString('base64url');res.cookie(bindingName,value,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:600_000});req.headers.cookie=(req.headers.cookie?req.headers.cookie+'; ':'')+bindingName+'='+value;}
    view(res,'Sign in',`<p>Use your email to receive a code. It is not shared with community websites.</p><form method="post" action="/identity/login/request">${hidden(req,'/identity/login/request')}<input type="hidden" name="next" value="${escape(safeNext(req.query.next))}">${field('Email address','email','email')}<button>Send code</button></form>`);
  });
  app.post('/identity/login/request',body,protect,async(req,res)=>{
    try{const id=await accounts.requestCode(req.body.email,bind(req),req.ip);codeForm(req,res,id,safeNext(req.body.next));}
    catch(e){res.status(e.status??400);view(res,'Sign-in needs another try',`<p>${escape(e.message)}</p><a href="/identity/login">Return to sign-in</a>`);}
  });
  app.post('/identity/login/verify',body,protect,(req,res)=>{
    const next=safeNext(req.body.next);
    try{
      const session=accounts.verifyCode(req.body.challenge,req.body.code,bind(req));
      accounts.logout(req);res.cookie(accounts.cookieName,session.token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:session.expires-Date.now()});
      res.clearCookie(bindingName,{path:'/',httpOnly:true,secure,sameSite:'lax'});res.redirect(303,next);
    }catch(e){res.status(400);codeForm(req,res,req.body.challenge??'',next,e.message);}
  });
  app.post('/identity/logout',body,protect,(req,res)=>{accounts.logout(req);res.clearCookie(accounts.cookieName,{path:'/',httpOnly:true,secure,sameSite:'lax'});res.redirect(303,'/identity/login');});
  app.get('/identity/account',(req,res)=>{
    const u=user(req,res);if(!u)return;
    const memberships=accounts.adapter.memberships(u.id),confirmations=accounts.adapter.confirmations(u.id),organisations=accounts.organisations(u.id);
    view(res,'Your account',`<p><a href="/identity/sites">Manage website connections</a></p><h2>Approved memberships</h2>${memberships.length?'<ul>'+memberships.map(m=>`<li>${escape(m.name)}</li>`).join('')+'</ul>':'<p>No approved memberships yet.</p>'}${confirmations.length?'<h2>Your confirmations</h2><ul>'+confirmations.map(c=>'<li>'+escape(c.name)+' · '+escape(c.organisation.name)+'</li>').join('')+'</ul>':''}${organisations.length?'<h2>Organisations you administer</h2><ul>'+organisations.map(o=>`<li><a href="/identity/organisations/${encodeURIComponent(o.id)}">${escape(o.name)}</a></li>`).join('')+'</ul>':''}${accounts.isOperator(u.id)?'<p><a href="/identity/operator">Register an organisation</a></p>':''}<form method="post" action="/identity/logout">${hidden(req,'/identity/logout')}<button class="secondary">Sign out of this account</button></form>`);
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
