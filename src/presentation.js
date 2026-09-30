import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exampleClient,exampleURL} from './example-site.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const displayName=config=>config.displayName??'Unanym';
export const developerURL=config=>config.developerURL??(config.basePath??'/identity')+'/developers';
const template=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
// Asset URLs carry a hash of the shipped styles and scripts, so a deploy is
// never paired with a stylesheet or script cached from the previous release.
let version;
const assetVersion=()=>version??=readdirSync(new URL('../web/',import.meta.url)).filter(f=>/\.(css|js)$/.test(f)).sort()
  .reduce((hash,f)=>hash.update(f).update(template(f)),createHash('sha256')).digest('hex').slice(0,10);
export const versionAssets=html=>html.replace(/(\/assets\/[\w.-]+\.(?:css|js))(?=")/g,'$1?v='+assetVersion());
const render=(source,values)=>versionAssets(source.replace(/\{\{([a-z_]+)\}\}/g,(_match,key)=>escape(values[key]??'')));
export function frontPage(config,{assets=(config.basePath??'/identity')+'/assets/',home='/',signIn=(config.basePath??'/identity')+'/account'}={}) {
  return render(template('front.html'),{brand:displayName(config),brand_mark:displayName(config)==='FRRN'?'frrn':displayName(config),assets,home,sign_in:signIn,developers:developerURL(config),privacy:(config.basePath??'/identity')+'/about'});
}
export function overviewPage(config,{assets='/assets/'}={}) {
  const built=release();
  return render(template('overview.html'),{assets,guides:'/docs/',developers:developerURL(config),version:built.version??'',
    tested_wordpress:built.tested?.wordpress??'',tested_generic:built.tested?.openid_connect_generic??''});
}
// Geometry vocabulary shared by the hero, the chapters and the mark.
// You are an isometric cube: each website is shown one face, and the top face
// is what you keep. Communities are squares whose token is a membership; the
// identity service is the dashed ring around you; websites sit on one orbit.
const n=v=>Math.round(v*10)/10;
const pt=([x,y])=>`${n(x)} ${n(y)}`;
const poly=pts=>'M'+pts.map(pt).join('L')+'Z';
const hex=(cx,cy,s)=>[[cx,cy-s],[cx+.866*s,cy-s/2],[cx+.866*s,cy+s/2],[cx,cy+s],[cx-.866*s,cy+s/2],[cx-.866*s,cy-s/2]];
const faces=(cx,cy,s)=>{const h=hex(cx,cy,s),c=[cx,cy];return {top:[h[0],h[1],c,h[5]],left:[h[5],c,h[3],h[4]],right:[c,h[1],h[2],h[3]]};};
// colours: keep (neutral), coral, amber, blue; a website receives exactly one face.
const cube=(cx,cy,s,{top='keep',left='coral',right='amber',cls=''}={})=>{const f=faces(cx,cy,s);
  return `<g class="cube${cls}"><path class="f-${top}" d="${poly(f.top)}"/><path class="f-${left}" d="${poly(f.left)}"/><path class="f-${right}" d="${poly(f.right)}"/></g>`;};
// One face drawn on its own, centred on (cx,cy).
const face=(side,colour,cx,cy,s)=>{const f=faces(0,0,s)[side],mx=f.reduce((a,p)=>a+p[0],0)/4,my=f.reduce((a,p)=>a+p[1],0)/4;
  return `<path class="f-${colour}" d="${poly(f.map(([x,y])=>[x-mx+cx,y-my+cy]))}"/>`;};
const trim=([x1,y1],[x2,y2],from,to)=>{const d=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/d,uy=(y2-y1)/d;
  return [[x1+ux*from,y1+uy*from],[x2-ux*to,y2-uy*to]];};
const along=([[x1,y1],[x2,y2]],t)=>[x1+(x2-x1)*t,y1+(y2-y1)*t];
const d=seg=>`M${pt(seg[0])}L${pt(seg[1])}`;
// Gradient strokes are set as attributes; the stylesheet never overrides them.
const gradient=(id,seg,from,to)=>`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(seg[0][0])}" y1="${n(seg[0][1])}" x2="${n(seg[1][0])}" y2="${n(seg[1][1])}"><stop offset="0" class="stop-${from}"/><stop offset="1" class="stop-${to}"/></linearGradient>`;
const link=(seg,cls,grad)=>`<path class="link ${grad?'':'plain '}${cls}" pathLength="1"${grad?` stroke="url(#${grad})"`:''} d="${d(seg)}"/>`;
const token=([x,y],key,size=10,cls='')=>`<rect class="token org-${key}${cls}" x="${n(x-size/2)}" y="${n(y-size/2)}" width="${size}" height="${size}" rx="${n(size/4)}"/>`;
const check=([x,y],size)=>`<path class="check" d="M${n(x-size*.28)} ${n(y)}l${n(size*.2)} ${n(size*.2)} ${n(size*.36)}-${n(size*.4)}"/>`;
const org=([x,y],key,size=48)=>`<g class="org org-${key}"><rect class="node" x="${n(x-size/2)}" y="${n(y-size/2)}" width="${size}" height="${size}" rx="${n(size/4)}"/>${token([x,y],key,size*.34)}</g>`;
const lock=([x,y])=>`<g class="lock"><rect x="${n(x-6)}" y="${n(y-1)}" width="12" height="9" rx="2"/><path d="M${n(x-3.5)} ${n(y-1)}v-3a3.5 3.5 0 0 1 7 0v3"/></g>`;
// A token that travels a segment once per cycle; hidden when motion is reduced.
const mover=(seg,key,begin,size=9)=>`<rect class="mover token org-${key}" x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" rx="${size/4}" opacity="0"><animateMotion dur="8s" begin="${begin}s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.3;1" calcMode="linear" path="${d(seg)}"/><animate attributeName="opacity" dur="8s" begin="${begin}s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;.03;.29;.33;1"/></rect>`;
const site=([x,y],{side,colour,name,id,shares=[],w=84,h=80,off=false})=>{
  const box=`<rect class="node" x="${n(x-w/2)}" y="${n(y-h/2)}" width="${w}" height="${h}" rx="13"/>`;
  if(off)return `<g class="site off">${box}${lock([x,y-2])}</g>`;
  const rows=id?[y-20,y+8,y+24]:[y-16,y+11,y+27];
  return `<g class="site">${box}<g class="appear d4">${face(side,colour,x,rows[0],15)}<text class="name" x="${x}" y="${n(rows[1]+4)}" text-anchor="middle">${name}</text>`+
    (id?`<text class="ident" x="${x}" y="${n(rows[2]+4)}" text-anchor="middle">${id}</text>`:shares.map((k,j)=>token([x-(shares.length-1)*7+j*14,rows[2]],k,9)).join(''))+`</g></g>`;};
const svg=(cls,w,h,body,defs='')=>`<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${defs?`<defs>${defs}</defs>`:''}${body}</svg>`;
const polar=([cx,cy],r,deg)=>[cx+r*Math.cos(deg*Math.PI/180),cy+r*Math.sin(deg*Math.PI/180)];

// Hero: communities and websites on one orbit around you.
function heroGeometry() {
  const c=[262,262],orbit=178,ring=66,defs=[`<radialGradient id="disc-glow" cx="50%" cy="50%" r="50%"><stop offset="0" class="stop-disc-in"/><stop offset="1" class="stop-disc-out"/></radialGradient>`];
  const orgs=[[polar(c,orbit,215),'a'],[polar(c,orbit,145),'b']];
  const sites=[{at:polar(c,orbit,-40),side:'left',colour:'coral',name:'Robin',shares:['a']},{at:polar(c,orbit,0),side:'right',colour:'amber',name:'R.',shares:['a','b']},{at:polar(c,orbit,40),off:true,shares:[]}];
  const under=[`<circle class="disc" cx="${c[0]}" cy="${c[1]}" r="256" fill="url(#disc-glow)"/>`,`<circle class="orbit" cx="${c[0]}" cy="${c[1]}" r="${orbit}"/>`,`<circle class="service" cx="${c[0]}" cy="${c[1]}" r="${ring}"/>`];
  const lines=[],over=[],moving=[];
  orgs.forEach(([at,key],i)=>{const seg=trim(at,c,30,ring);defs.push(gradient('hi'+i,seg,key,'line'));
    lines.push(link(seg,'draw d1','hi'+i));over.push(token(seg[1],key,11,' appear d2'));moving.push(mover(seg,key,3.2+i*.25));});
  sites.forEach((s,i)=>{const seg=trim(c,s.at,ring,46);
    if(s.off){const gate=along(seg,.55),[[x1,y1],[x2,y2]]=seg,len=Math.hypot(x2-x1,y2-y1),px=-(y2-y1)/len*9,py=(x2-x1)/len*9;
      lines.push(link([seg[0],gate],'draw d3'),`<path class="gate appear d4" d="M${pt([gate[0]+px,gate[1]+py])}L${pt([gate[0]-px,gate[1]-py])}"/>`);return;}
    defs.push(gradient('ho'+i,seg,'line','face-'+s.colour));lines.push(link(seg,'draw d3','ho'+i));
    s.shares.forEach((k,j)=>moving.push(mover(seg,k,5.8+i*.3+j*.35)));});
  const body=[...under,...lines,cube(c[0],c[1],34,{left:'coral',right:'amber'}),...over,
    ...orgs.map(([at,key])=>org(at,key)),...sites.map(s=>site(s.at,s)),...moving];
  return svg('geo geo-hero',524,524,body.join(''),defs.join(''));
}
// Chapters zoom into one part of the hero.
const chapters={
  organisers(){const o=[78,130],members=[[262,52],[284,130],[262,208]],lines=[],marks=[],defs=[];
    members.forEach((m,i)=>{const seg=trim(o,m,32,24),off=i===2;if(!off)defs.push(gradient('c1'+i,seg,'a','line'));
      lines.push(link(seg,off?'off':'draw d1',off?null:'c1'+i));
      marks.push(cube(m[0],m[1],17,{top:'keep',left:'mute',right:'mute2',cls:off?' dim':''}),
        off?token([m[0]+24,m[1]+14],'a',17,' hollow'):`<g class="appear d2">${token([m[0]+24,m[1]+14],'a',17)}${check([m[0]+24,m[1]+14],17)}</g>`);});
    return svg('geo geo-chapter',360,260,[...lines,org(o,'a',58),...marks].join(''),defs.join(''));},
  members(){const you=[92,110],to=[{at:[282,58],side:'left',colour:'coral',name:'Robin',shares:['a']},{at:[282,172],side:'right',colour:'amber',name:'R.',shares:['a','b']}],lines=[],moving=[],defs=[];
    to.forEach((s,i)=>{const seg=trim(you,s.at,36,46);defs.push(gradient('c2'+i,seg,'line','face-'+s.colour));lines.push(link(seg,'draw d1','c2'+i));
      s.shares.forEach((k,j)=>moving.push(mover(seg,k,1.6+i*.4+j*.35)));});
    const at=[92,206];
    return svg('geo geo-chapter',360,260,[...lines,`<path class="tether" d="M92 148V${at[1]-16}"/>`,cube(you[0],you[1],30),
      `<circle class="email" cx="${at[0]}" cy="${at[1]}" r="15"/><text class="at" x="${at[0]}" y="${at[1]+5}" text-anchor="middle">@</text>`,lock([at[0]+22,at[1]-12]),
      ...to.map(s=>site(s.at,s)),...moving].join(''),defs.join(''));},
  websites(){const boxes=[[[64,130],'left','coral','Robin','4f2c…'],[[180,130],'right','amber','R.','a91e…'],[[296,130],'top','blue','Rob','7d03…']],b=[];
    for(let i=0;i<2;i++){const x=(boxes[i][0][0]+boxes[i+1][0][0])/2;b.push(`<path class="cross" d="M${x-5} 125l10 10m0-10l-10 10"/>`);}
    boxes.forEach(([at,side,colour,name,id])=>b.push(site(at,{side,colour,name,id,w:96,h:96})));
    return svg('geo geo-chapter',360,260,b.join(''));},
  operators(){const groups=[[[76,150],false],[[186,92],true],[[290,168],false]],b=[];
    groups.forEach(([c,mine])=>{b.push(`<g class="constellation${mine?' mine':''}"><circle class="service" cx="${c[0]}" cy="${c[1]}" r="30"/>`);
      [-40,20,80].forEach(deg=>{const tip=polar(c,56,deg),seg=trim(c,tip,30,7);b.push(link(seg,'plain'),`<rect class="node mini" x="${n(tip[0]-7)}" y="${n(tip[1]-7)}" width="14" height="14" rx="4"/>`);});
      b.push(cube(c[0],c[1],13,mine?{}:{top:'keep',left:'mute',right:'mute2'}),'</g>');});
    b.push(`<text class="small" x="186" y="42" text-anchor="middle">yours</text>`);
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
