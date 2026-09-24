// Illustrative places only. No account reads, network mutations or browser storage.
const places={runners:{name:'Northside Runners',membership:'Northside member',nameHere:'Rob'},choir:{name:'Riverside Choir',membership:'Riverside member',nameHere:'Robin'},repair:{name:'Repair Café',membership:'Repair Café member',nameHere:'Robin Maas'}};
const initial=()=>Object.fromEntries(Object.entries(places).map(([id,p])=>[id,{draft:{name:p.nameHere,membership:id==='runners'},shared:id==='repair'?null:{name:p.nameHere,membership:id==='runners'},active:id!=='repair'}]));
let state=initial(),selected='repair';
const form=document.querySelector('#sharing-form'),input=document.querySelector('#chosen-name'),membership=document.querySelector('#share-membership'),share=document.querySelector('#share'),status=document.querySelector('#sharing-status');
const disconnect=document.querySelector('#disconnect'),history=document.querySelector('#sharing-history');
const dirty=s=>!s.shared||s.draft.name!==s.shared.name||s.draft.membership!==s.shared.membership;
const describe=(s,p)=>s.name+(s.membership?' · '+p.membership:' · no membership');
function renderCard(id){
  const p=places[id],s=state[id],card=document.querySelector('#place-'+id),editing=id===selected;
  const preview=editing&&dirty(s),visible=preview?s.draft:s.shared;
  card.classList.toggle('selected',editing);card.classList.toggle('preview',preview);card.classList.toggle('disconnected',!s.active&&!preview);
  card.querySelector('.place-select').setAttribute('aria-expanded',String(editing));card.querySelector('.select-mark').textContent=editing?'−':'＋';
  card.querySelector('.receipt-label').textContent=preview?'Preview':s.active?'Shared':s.shared?'Previously shared':'Not connected';
  card.querySelector('.receipt-person').hidden=!visible;
  card.querySelector('.receipt-name').textContent=visible?.name||'Your name';
  card.querySelector('.avatar').textContent=[...(visible?.name||'R')][0].toUpperCase();
  const chips=card.querySelector('.receipt-memberships');chips.replaceChildren();
  if(visible?.membership){const chip=document.createElement('span');chip.className='membership-chip';const text=document.createElement('span');text.textContent=p.membership;chip.append(text);chips.append(chip);}
}
function render(){
  Object.keys(places).forEach(renderCard);
  const p=places[selected],s=state[selected],changed=dirty(s);
  document.querySelector('#membership-label').textContent=p.membership;
  share.textContent=s.active&&!changed?'Shared ✓':s.active?'Share changes ↑':s.shared?'Reconnect ↑':'Share with '+p.name+' ↑';
  share.disabled=(s.active&&!changed)||!s.draft.name.trim();disconnect.hidden=!s.active;
  history.hidden=!s.shared||(s.active&&!changed);
  if(history.hidden)history.open=false;
  document.querySelector('#history-label').textContent=s.active?'Currently shared':'Previously shared';
  document.querySelector('#history-detail').textContent=s.shared?describe(s.shared,p):'';
}
function choose(id){
  selected=id;const s=state[id];input.value=s.draft.name;membership.checked=s.draft.membership;
  document.querySelector('#editor-'+id).append(form);form.hidden=false;render();
  status.textContent='Your choices for '+places[id].name+'.';
}
for(const button of document.querySelectorAll('[data-select]')){
  button.disabled=false;button.addEventListener('click',()=>{
    if(selected===button.dataset.select){selected=null;form.hidden=true;Object.keys(places).forEach(renderCard);status.textContent='Choose a place.';}
    else choose(button.dataset.select);
  });
}
function edit(){state[selected].draft={name:input.value.trim(),membership:membership.checked};render();status.textContent='Preview only. Share when ready.';}
input.addEventListener('input',edit);membership.addEventListener('change',edit);
form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity()||!input.value.trim())return;
  const s=state[selected];s.shared={...s.draft};s.active=true;render();
  const card=document.querySelector('#place-'+selected);card.classList.remove('just-shared');requestAnimationFrame(()=>card.classList.add('just-shared'));
  status.textContent='Shared with '+places[selected].name+' in this example.';
});
disconnect.addEventListener('click',()=>{state[selected].active=false;render();history.open=true;status.textContent='Future access ended. Previous copies may remain.';share.focus({preventScroll:true});});
const reset=document.querySelector('#reset');reset.hidden=false;reset.addEventListener('click',()=>{state=initial();for(const card of document.querySelectorAll('.place'))card.classList.remove('just-shared');choose('repair');status.textContent='Example reset. Nothing was sent or saved.';});
document.documentElement.classList.add('enhanced');
choose('repair');
