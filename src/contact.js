// The public site's only write: a message to the operator, relayed by email
// and never stored here. The recipient address is configuration, never shown.
import express from 'express';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {memberPage} from './presentation.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
const oneLine=value=>!/[\x00-\x1f\x7f]/.test(value);
export const plainAddress=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>"'?#&,;:()\\[\]]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i.test(value);

export function contactRoutes(config,{send,now=Date.now,perVisitor=3,perDay=20}={}) {
  const router=express.Router(),key=randomBytes(32);
  // The form carries its own issue time, so a reply needs no cookie or storage.
  // Posting within three seconds, or after two hours, is refused.
  const mac=t=>createHmac('sha256',key).update(String(t)).digest('base64url');
  const issued=value=>{
    const [t,given]=String(value??'').split('.'),expected=mac(t),age=now()-Number(t);
    return /^\d+$/.test(t)&&typeof given==='string'&&given.length===expected.length&&timingSafeEqual(Buffer.from(given),Buffer.from(expected))&&age>=3000&&age<=7_200_000;
  };
  // Mail leaves through the account that also delivers sign-in codes; these
  // limits keep a flood of messages from spending its daily allowance.
  const recent=new Map();let today=[];
  const allow=visitor=>{
    const t=now();today=today.filter(x=>t-x<86_400_000);
    const mine=(recent.get(visitor)??[]).filter(x=>t-x<3_600_000);
    if(today.length>=perDay||mine.length>=perVisitor)return false;
    if(recent.size>=10_000)recent.clear();
    mine.push(t);recent.set(visitor,mine);today.push(t);return true;
  };
  const formAction=(_req,res,next)=>{res.set('Content-Security-Policy',res.get('Content-Security-Policy').replace("form-action 'none'","form-action 'self'"));next();};
  const page=(res,status,body)=>res.status(status).send(memberPage(config,'Contact',`<div class="member-form-page contact-page"><div class="narrow">${body}</div></div>`,{access:true,current:'contact'}));
  const form=(res,status,{values={},error=''}={})=>{
    const t=now(),v=name=>escape(values[name]??'');
    page(res,status,`<h1>Get in touch</h1>
<p>Questions about Unanym, or bringing your community to a pilot. We reply by email.</p>
${error?`<p class="form-error" role="alert">${escape(error)}</p>`:''}
<form method="post" action="/contact">
<input type="hidden" name="issued" value="${t}.${mac(t)}">
<label for="contact-name">Your name <span class="optional">optional</span></label><input id="contact-name" name="name" maxlength="100" autocomplete="name" value="${v('name')}">
<label for="contact-email">Your email</label><input id="contact-email" name="email" type="email" maxlength="254" autocomplete="email" required value="${v('email')}">
<label for="contact-community">Community or website <span class="optional">optional</span></label><input id="contact-community" name="community" maxlength="150" value="${v('community')}">
<label for="contact-message">Message</label><textarea id="contact-message" name="message" rows="8" minlength="10" maxlength="4000" required>${v('message')}</textarea>
<div class="contact-trap" aria-hidden="true"><label for="contact-website">Leave this empty</label><input id="contact-website" name="website" tabindex="-1" autocomplete="off"></div>
<button>Send message</button>
</form>
<p class="help">Your message and email go to the operator of this service by email, only so they can reply. This site does not keep them.</p>`);
  };
  router.get('/contact',formAction,(_req,res)=>send?form(res,200):page(res,200,'<h1>Get in touch</h1><p>This installation has no contact address.</p>'));
  router.get('/contact/sent',(_req,res)=>page(res,200,'<h1>Message sent</h1><p>Thank you. We will reply to the email address you gave.</p><p><a class="button secondary" href="/">Back to the front page</a></p>'));
  router.post('/contact',formAction,express.urlencoded({extended:false,limit:'16kb',parameterLimit:10}),async(req,res)=>{
    if(!send)return page(res,503,'<h1>Get in touch</h1><p>This installation has no contact address.</p>');
    const body=req.body??{},values={name:text(body.name),email:text(body.email),community:text(body.community),message:text(body.message)};
    // A filled hidden field is a bot; it is thanked and nothing is sent.
    if(text(body.website))return res.redirect(303,'/contact/sent');
    if(!issued(body.issued))return form(res,400,{values,error:'This form expired. Please send it again.'});
    if(!plainAddress(values.email))return form(res,400,{values,error:'Enter an email address we can reply to.'});
    if(values.name.length>100||values.community.length>150||!oneLine(values.name)||!oneLine(values.community))return form(res,400,{values,error:'Keep your name and community to one short line.'});
    if(values.message.length<10||values.message.length>4000)return form(res,400,{values,error:'Write a message of 10 to 4000 characters.'});
    if(!allow(req.ip))return form(res,429,{values,error:'Too many messages for now. Please try again later.'});
    try{await send(values);}
    catch{return form(res,503,{values,error:'Your message could not be sent. Please try again later.'});}
    res.redirect(303,'/contact/sent');
  });
  return router;
}
