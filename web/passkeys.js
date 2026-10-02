import {browserSupportsWebAuthn,startRegistration,startAuthentication} from '@simplewebauthn/browser';

async function post(path,data) {
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await res.json().catch(()=>({error:'Return to the page and try again.'}));
  if(!res.ok)throw new Error(result.error);
  return result;
}
for(const form of document.querySelectorAll('form[data-passkey]')) {
  if(!browserSupportsWebAuthn())continue;
  form.hidden=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const fields=new FormData(form),kind=form.dataset.passkey,path='/identity/passkeys/'+kind,button=form.querySelector('button'),status=form.querySelector('[role=status]');
    button.disabled=true;status.textContent='Follow your browser’s passkey prompt.';
    try{
      const challenge=await post(path+'/options',{csrf:fields.get('csrf')});
      const response=kind==='register'?await startRegistration({optionsJSON:challenge.options}):await startAuthentication({optionsJSON:challenge.options});
      const result=await post(path+'/verify',{csrf:fields.get('verify_csrf'),challenge:challenge.challenge,response,label:fields.get('label'),next:fields.get('next')});
      window.location.assign(result.next);
    }catch(error){status.textContent=error.name==='NotAllowedError'?'Passkey cancelled. Try again or use an email code.':error.message;button.disabled=false;}
  });
}
