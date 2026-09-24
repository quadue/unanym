// A local, fictional walkthrough. No account APIs, persistence or analytics.
const root=document.querySelector('.learn');
const select=root.querySelector('#practice-name');
const membership=root.querySelector('#practice-membership');
const labels={start:'Start · At the fictional community website',choose:'Step 1 of 3 · Choosing with FRRN',connected:'Step 2 of 3 · Back at Garden community',manage:'Step 3 of 3 · My connections with FRRN',done:'Finished · Practice only'};
function preview(){
 root.querySelectorAll('[data-preview-name]').forEach(el=>el.textContent=select.value);
 root.querySelectorAll('[data-preview-membership]').forEach(el=>el.textContent=membership.checked?'Membership: Meadow circle':'No community memberships');
}
function go(step){
 root.querySelectorAll('[data-step]').forEach(el=>el.hidden=el.dataset.step!==step);
 root.querySelector('#practice-progress').textContent=labels[step];
 const heading=root.querySelector(`[data-step="${step}"] h3`);
 heading.focus({preventScroll:true});
 root.querySelector(step==='start'?'#practice':'#practice-progress').scrollIntoView({block:'start',behavior:'instant'});
}
root.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.go)));
select.addEventListener('change',preview);membership.addEventListener('change',preview);
root.querySelector('#restart-practice').addEventListener('click',()=>{select.value='Robin';membership.checked=false;preview();go('start');});
root.querySelector('#practice-app').hidden=false;

const cards=[...root.querySelectorAll('[data-scene]')];
const play=root.querySelector('#watch-story');
const next=root.querySelector('#next-scene');
const caption=root.querySelector('#story-caption');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let timer=null,scene=-1;
const captions=['1 of 3 · Sign in through FRRN. Each website keeps its own rules.','2 of 3 · Choose your name and any membership to share.','3 of 3 · Review your connections with FRRN. Disconnecting does not erase past sharing.'];
function show(index){scene=index;cards.forEach((el,i)=>el.classList.toggle('is-current',i===index));caption.textContent=captions[index];}
function pause(){clearInterval(timer);timer=null;play.textContent=scene===2?'Watch again':scene<0?'Watch the steps':'Watch from the beginning';}
play.addEventListener('click',()=>{
 if(timer){pause();return;}
 show(0);play.textContent='Pause';
 timer=setInterval(()=>{show(scene+1);if(scene===2)pause();},5500);
});
next.addEventListener('click',()=>{pause();show((scene+1)%3);pause();});
function motionPreference(){pause();play.hidden=reduced.matches;}
reduced.addEventListener('change',motionPreference);motionPreference();
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
root.querySelector('#animation-controls').hidden=false;
