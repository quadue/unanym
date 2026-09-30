import {readFileSync} from 'node:fs';
import {exampleClient,exampleURL} from './example-site.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const displayName=config=>config.displayName??'Unanym';
export const developerURL=config=>config.developerURL??(config.basePath??'/identity')+'/developers';
const template=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
const render=(source,values)=>source.replace(/\{\{([a-z_]+)\}\}/g,(_match,key)=>escape(values[key]??''));
export function frontPage(config,{assets=(config.basePath??'/identity')+'/assets/',home='/',signIn=(config.basePath??'/identity')+'/account'}={}) {
  return render(template('front.html'),{brand:displayName(config),brand_mark:displayName(config)==='FRRN'?'frrn':displayName(config),assets,home,sign_in:signIn,developers:developerURL(config),privacy:(config.basePath??'/identity')+'/about'});
}
export function overviewPage(config,{assets='/assets/'}={}) {
  const built=release();
  return render(template('overview.html'),{assets,guides:'/docs/',developers:developerURL(config),version:built.version??'',
    tested_wordpress:built.tested?.wordpress??'',tested_generic:built.tested?.openid_connect_generic??''});
}
// Line-art vocabulary shared by the hero and its chapters: organisations are
// squares holding a membership token, a person is a circle, the identity
// service is a dashed ring, websites are boxes showing their own "you".
const n=v=>Math.round(v*10)/10;
const trim=([x1,y1],[x2,y2],from,to)=>{const d=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/d,uy=(y2-y1)/d;
  return [[n(x1+ux*from),n(y1+uy*from)],[n(x2-ux*to),n(y2-uy*to)]];};
const along=([[x1,y1],[x2,y2]],t)=>[n(x1+(x2-x1)*t),n(y1+(y2-y1)*t)];
const line=(seg,cls,grad)=>`<path class="${cls}" pathLength="1"${grad?` stroke="url(#${grad})"`:''} d="M${seg[0][0]} ${seg[0][1]}L${seg[1][0]} ${seg[1][1]}"/>`;
// Gradients run along each line in user space, so every stroke fades from its source.
const gradient=(id,seg,from,to)=>`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${seg[0][0]}" y1="${seg[0][1]}" x2="${seg[1][0]}" y2="${seg[1][1]}"><stop offset="0" class="stop-${from}"/><stop offset="1" class="stop-${to}"/></linearGradient>`;
const token=([x,y],key,size=10,cls='')=>`<rect class="token org-${key}${cls}" x="${n(x-size/2)}" y="${n(y-size/2)}" width="${size}" height="${size}" rx="2.5"/>`;
const org=([x,y],key,size=44)=>`<g class="org org-${key}"><rect class="node" x="${n(x-size/2)}" y="${n(y-size/2)}" width="${size}" height="${size}" rx="11"/>${token([x,y],key,size*.3)}</g>`;
const person=([x,y],r=30,cls='')=>`<g class="person${cls}"><circle class="node" cx="${x}" cy="${y}" r="${r}"/><circle class="glyph" cx="${x}" cy="${n(y-r*.2)}" r="${n(r*.2)}"/><path class="glyph" d="M${n(x-r*.38)} ${n(y+r*.42)}a${n(r*.38)} ${n(r*.3)} 0 0 1 ${n(r*.76)} 0"/></g>`;
const shape=(kind,[x,y],r=9)=>kind==='triangle'?`<path class="face face-${kind}" d="M${x} ${n(y-r)}L${n(x+r*1.05)} ${n(y+r*.75)}H${n(x-r*1.05)}Z"/>`
  :kind==='diamond'?`<path class="face face-${kind}" d="M${x} ${n(y-r)}L${n(x+r)} ${y}L${x} ${n(y+r)}L${n(x-r)} ${y}Z"/>`
  :kind==='circle'?`<circle class="face face-${kind}" cx="${x}" cy="${y}" r="${n(r*.85)}"/>`:'';
const site=([x,y],{face,name,w=78,h=62,off=false}={})=>`<g class="site${off?' off':''}"><rect class="node" x="${n(x-w/2)}" y="${n(y-h/2)}" width="${w}" height="${h}" rx="12"/>${off?'':`<g class="appear d4">${shape(face,[x,y-9])}<text class="name" x="${x}" y="${n(y+19)}" text-anchor="middle">${name}</text></g>`}</g>`;
const svg=(cls,w,h,body,defs='')=>`<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${defs?`<defs>${defs}</defs>`:''}${body}</svg>`;

// Hero: the whole system inside one disc.
function heroGeometry() {
  const you=[262,262],ring=72,orgs=[[[104,176],'a'],[[104,348],'b']];
  const sites=[{at:[414,150],face:'triangle',name:'Robin',shares:['a']},{at:[430,262],face:'diamond',name:'R.',shares:['a','b']},{at:[414,374],off:true,shares:[]}];
  const defs=[],body=[`<circle class="disc" cx="262" cy="262" r="256"/>`];
  orgs.forEach(([at,key],i)=>{const seg=trim(at,you,26,ring);defs.push(gradient('hi'+i,seg,key,'ring'));
    body.push(line(seg,'link draw d1','hi'+i),token(seg[1],key,10,' appear d2'));});
  sites.forEach((s,i)=>{const seg=trim(you,s.at,ring,40);
    if(s.off){body.push(line(seg,'link off appear d3'));return;}
    defs.push(gradient('ho'+i,seg,'ring','face-'+s.face));body.push(line(seg,'link draw d3','ho'+i));
    s.shares.forEach((k,j)=>body.push(token(along(seg,.5+(j-(s.shares.length-1)/2)*.16),k,9,' appear d4')));});
  body.push(`<circle class="service" cx="${you[0]}" cy="${you[1]}" r="${ring}"/>`,person(you,32));
  orgs.forEach(([at,key])=>body.push(org(at,key)));
  sites.forEach(s=>body.push(site(s.at,s)));
  return svg('geo geo-hero',524,524,body.join(''),defs.join(''));
}
// Chapters zoom into one part of the hero.
const chapters={
  organisers(){const o=[84,130],members=[[268,52],[284,130],[268,208]],b=[org(o,'a',52)],d=[];
    members.forEach((m,i)=>{const seg=trim(o,m,30,22),off=i===2;if(!off)d.push(gradient('c1'+i,seg,'a','ring'));
      b.unshift(line(seg,off?'link off':'link draw d1',off?null:'c1'+i));b.push(person(m,18,off?' dim':''),token([m[0]+26,m[1]-14],'a',9,off?' hollow':' appear d2'));});
    return svg('geo geo-chapter',360,260,b.join(''),d.join(''));},
  members(){const you=[80,130],to=[[{at:[284,52],face:'triangle',name:'Robin'},['a']],[{at:[296,130],face:'diamond',name:'R.'},['a','b']],[{at:[284,208],off:true},[]]],b=[],d=[];
    to.forEach(([s,shares],i)=>{const seg=trim(you,s.at,34,40);if(s.off){b.push(line(seg,'link off'));}else{d.push(gradient('c2'+i,seg,'ring','face-'+s.face));b.push(line(seg,'link draw d1','c2'+i));}
      shares.forEach((k,j)=>b.push(token(along(seg,.5+(j-(shares.length-1)/2)*.2),k,9,' appear d2')));b.push(site(s.at,{...s,w:70,h:56}));});
    b.push(person(you,30));return svg('geo geo-chapter',360,260,b.join(''),d.join(''));},
  websites(){const sites=[[[62,130],'triangle','Robin'],[[180,130],'diamond','R.'],[[298,130],'circle','Rob']],b=[];
    for(let i=0;i<2;i++){const x=(sites[i][0][0]+sites[i+1][0][0])/2;b.push(`<path class="link off" d="M${sites[i][0][0]+38} 130H${sites[i+1][0][0]-38}"/><path class="cross" d="M${x-6} 124l12 12m0-12l-12 12"/>`);}
    sites.forEach(([at,face,name])=>b.push(site(at,{face,name,w:74,h:64})));
    b.push(`<text class="small" x="180" y="206" text-anchor="middle">a different identifier at each</text>`);
    return svg('geo geo-chapter',360,260,b.join(''));},
  operators(){const rings=[[[88,136],62,false],[[214,92],46,true],[[290,178],50,false]],b=[];
    rings.forEach(([[x,y],r,mine])=>{b.push(`<circle class="service${mine?' mine':''}" cx="${x}" cy="${y}" r="${r}"/>`);
      [[-.42,-.2],[.35,-.35],[.1,.42]].forEach(([dx,dy])=>b.push(`<circle class="dot${mine?' mine':''}" cx="${n(x+dx*r)}" cy="${n(y+dy*r)}" r="${mine?5:4}"/>`));});
    return svg('geo geo-chapter',360,260,b.join(''));}};

export function homePage(config,{assets='/assets/'}={}) {
  const page=render(template('home.html'),{assets,guides:'/docs/',developers:developerURL(config)});
  return page.replace('<!--hero-->',heroGeometry()).replace(/<!--chapter:([a-z]+)-->/g,(_m,name)=>chapters[name]());
}
// Written by the build next to the WordPress package; absent in an unbuilt checkout.
const release=()=>{try{return JSON.parse(readFileSync(new URL('../dist/release.json',import.meta.url),'utf8'));}catch{return {};}};
export function developerPage(config,{assets=(config.basePath??'/identity')+'/assets/',home=config.publicDocs?'/learn':config.accountSource==='frrn'?config.origin+'/':(config.basePath??'/identity')+'/'}={}) {
  const base=config.basePath??'/identity',built=release(),frrn=config.accountSource==='frrn';
  return render(template('developers.html'),{assets,home,home_label:config.publicDocs?'Member walkthrough':displayName(config)+' ↗',home_footer:config.publicDocs?'Try the member walkthrough':'Back to '+displayName(config),developer_home:config.publicDocs?'/':developerURL(config),brand:displayName(config),issuer:config.issuer??'Supplied by your operator',
    scopes:config.contract==='legacy-firn'?'openid profile drop_identity drop_memberships':'openid profile identity.v1 memberships.v1',
    contract:config.contract??'community-v1',wordpress_download:base+'/wordpress.zip',download_hidden:config.demo||config.wordpressDownload?'':'hidden',
    documentation:base+'/docs/'+(frrn?'frrn-host':'hosting'),contract_doc:base+'/docs/contract',guides:base+'/docs/',websites_guide:base+'/docs/websites',operators_guide:base+'/docs/operators',
    release_notes:base+'/docs/release-notes',version:built.version??'',wordpress_checksum:built.wordpress_sha256??'',
    tested_wordpress:built.tested?.wordpress??'',tested_generic:built.tested?.openid_connect_generic??'',
    example_url:exampleClient(config)?exampleURL(config):'',example_hidden:exampleClient(config)?'':'hidden',
    organiser_screen:frrn?'organiser-frrn.png':'organiser-standalone.png',
    organiser_alt:frrn?'A FRRN community’s management page. Under Membership approvals, each member is listed with an Approve membership or Withdraw approval button.'
      :'An organisation’s administration page. The administrator enters a member’s email address, optionally sets an end date, and approves or revokes memberships.'});
}
