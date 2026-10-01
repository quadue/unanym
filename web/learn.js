// Optional illustration controls. Account creation happens at the linked host.
const root=document.querySelector('.learn');
const brand=root.dataset.brand||'Unanym';
const cards=[...root.querySelectorAll('[data-scene]')];
const play=root.querySelector('#watch-story');
const next=root.querySelector('#next-scene');
const caption=root.querySelector('#story-caption');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let timer=null,scene=-1;
const captions=[`1 of 3 · Sign in through ${brand}. Each website keeps its own rules.`,'2 of 3 · Choose your name and any membership to share.',`3 of 3 · Review your connections with ${brand}. Disconnecting does not erase past sharing.`];
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
