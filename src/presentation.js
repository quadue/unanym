import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exampleClient,exampleURL} from './example-site.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const displayName=config=>config.displayName??'Unanym';
export const developerURL=config=>config.developerURL??(config.basePath??'/identity')+'/developers';
export const memberAccountURL=config=>config.accountURL??(config.basePath??'/identity')+(config.contract==='legacy-firn'?'/sites':'/account');
const template=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
// Asset URLs carry a hash of the shipped styles and scripts, so a deploy is
// never paired with a stylesheet or script cached from the previous release.
let version;
const assetVersion=()=>version??=readdirSync(new URL('../web/',import.meta.url)).filter(f=>/\.(css|js|svg)$/.test(f)).sort()
  .reduce((hash,f)=>hash.update(f).update(template(f)),createHash('sha256')).digest('hex').slice(0,10);
export const versionAssets=html=>html.replace(/(\/assets\/[\w.-]+\.(?:css|js|svg))(?=")/g,'$1?v='+assetVersion());
const render=(source,values)=>versionAssets(source.replace(/\{\{([a-z_]+)\}\}/g,(_match,key)=>escape(values[key]??'')));
export function frontPage(config,{assets=(config.basePath??'/identity')+'/assets/',home='/',signIn=(config.basePath??'/identity')+'/account'}={}) {
  return render(template('front.html'),{brand:displayName(config),brand_mark:displayName(config)==='FRRN'?'frrn':displayName(config),assets,home,sign_in:signIn,developers:developerURL(config),privacy:(config.basePath??'/identity')+'/about'});
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
const site=([x,y],{side,colour,name,id,shares=[],w=84,h=80,off=false,note=''})=>{
  const box=`<rect class="node" x="${n(x-w/2)}" y="${n(y-h/2)}" width="${w}" height="${h}" rx="13"/>`;
  if(off)return `<g class="site off">${box}${lock([x,note?y-10:y-2])}${note?`<text class="note" x="${x}" y="${n(y+18)}" text-anchor="middle">${note}</text>`:''}</g>`;
  const rows=id?[y-20,y+8,y+24]:[y-16,y+11,y+27];
  return `<g class="site">${box}<g class="appear d4">${face(side,colour,x,rows[0],15)}<text class="name" x="${x}" y="${n(rows[1]+4)}" text-anchor="middle">${name}</text>`+
    (id?`<text class="ident" x="${x}" y="${n(rows[2]+4)}" text-anchor="middle">${id}</text>`:shares.map((k,j)=>token([x-(shares.length-1)*7+j*14,rows[2]],k,9)).join(''))+`</g></g>`;};
const tick=([x,y],on,size=15)=>`<g class="tick${on?' on':''}"><rect x="${n(x-size/2)}" y="${n(y-size/2)}" width="${size}" height="${size}" rx="4"/>${on?check([x,y],size):''}</g>`;
const label=([x,y],text,cls='')=>`<text class="label${cls}" x="${n(x)}" y="${n(y)}" text-anchor="middle">${text}</text>`;
const svg=(cls,w,h,body,defs='')=>`<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${defs?`<defs>${defs}</defs>`:''}${body}</svg>`;
const polar=([cx,cy],r,deg)=>[cx+r*Math.cos(deg*Math.PI/180),cy+r*Math.sin(deg*Math.PI/180)];

// Hero, wide: communities and websites on one orbit around you, labelled.
const disc=(id,[cx,cy],r)=>[`<radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" class="stop-disc-in"/><stop offset="1" class="stop-disc-out"/></radialGradient>`,`<circle class="disc" cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`];
function outgoing(prefix,c,ring,sites,{defs,lines,marks,moving},beginAt,siteGap=46){
  sites.forEach((s,i)=>{const seg=trim(c,s.at,ring,siteGap),box=along(seg,20/Math.hypot(seg[1][0]-seg[0][0],seg[1][1]-seg[0][1]));
    marks.push(tick(box,!s.off));
    if(s.off){const gate=along(seg,.72),[[x1,y1],[x2,y2]]=seg,len=Math.hypot(x2-x1,y2-y1),px=-(y2-y1)/len*9,py=(x2-x1)/len*9;
      lines.push(link([seg[0],gate],'draw d3'),`<path class="gate appear d4" d="M${pt([gate[0]+px,gate[1]+py])}L${pt([gate[0]-px,gate[1]-py])}"/>`);return;}
    defs.push(gradient(prefix+i,seg,'line','face-'+s.colour));lines.push(link(seg,'draw d3',prefix+i));
    s.shares.forEach((k,j)=>moving.push(mover(seg,k,beginAt+i*.3+j*.35)));});
}
function heroWide() {
  const c=[262,262],orbit=178,ring=66,[glow,discEl]=disc('glow-w',c,256),parts={defs:[glow],lines:[],marks:[],moving:[]};
  const orgs=[[polar(c,orbit,215),'a'],[polar(c,orbit,145),'b']];
  const sites=[{at:polar(c,orbit,-40),side:'left',colour:'coral',name:'Robin',shares:['a']},{at:polar(c,orbit,0),side:'right',colour:'amber',name:'R.',shares:['a','b']},{at:polar(c,orbit,40),off:true,note:'Not shared'}];
  const held=[];
  orgs.forEach(([at,key],i)=>{const seg=trim(at,c,30,ring);parts.defs.push(gradient('wi'+i,seg,key,'line'));
    parts.lines.push(link(seg,'draw d1','wi'+i));held.push(token(seg[1],key,11,' appear d2'));parts.moving.push(mover(seg,key,3.2+i*.25));});
  outgoing('wo',c,ring,sites,parts,5.8);
  const body=[discEl,`<circle class="orbit" cx="${c[0]}" cy="${c[1]}" r="${orbit}"/>`,`<circle class="service" cx="${c[0]}" cy="${c[1]}" r="${ring}"/>`,...parts.lines,
    cube(c[0],c[1],34),...held,...parts.marks,...orgs.map(([at,key])=>org(at,key)),...sites.map(s=>site(s.at,{...s,h:s.off?80:80})),
    label([c[0],c[1]+50],'You',' strong'),label([c[0],c[1]+ring+17],'Identity service'),label([orgs[0][0][0],orgs[0][0][1]-38],'Your communities'),label([sites[0].at[0],sites[0].at[1]-52],'Websites'),...parts.moving];
  return svg('geo geo-hero geo-hero-wide',524,524,body.join(''),parts.defs.join(''));
}
// Hero, phone: fewer, larger objects stacked top to bottom.
function heroTall() {
  const c=[180,228],ring=60,[glow,discEl]=disc('glow-t',[180,240],236),parts={defs:[glow],lines:[],marks:[],moving:[]};
  const orgs=[[[122,82],'a'],[[238,82],'b']];
  const sites=[{at:[112,396],side:'left',colour:'coral',name:'Robin',shares:['a','b']},{at:[248,396],off:true,note:'Not shared'}];
  const held=[];
  orgs.forEach(([at,key],i)=>{const seg=trim(at,c,28,ring);parts.defs.push(gradient('ti'+i,seg,key,'line'));
    parts.lines.push(link(seg,'draw d1','ti'+i));held.push(token(seg[1],key,12,' appear d2'));parts.moving.push(mover(seg,key,3.2+i*.25,11));});
  outgoing('to',c,ring,sites,parts,5.8,54);
  const body=[discEl,`<circle class="service" cx="${c[0]}" cy="${c[1]}" r="${ring}"/>`,...parts.lines,cube(c[0],c[1]-6,32),...held,...parts.marks,
    ...orgs.map(([at,key])=>org(at,key,52)),...sites.map(s=>site(s.at,{...s,w:112,h:96})),
    label([c[0],c[1]+40],'You',' strong'),`<text class="label" x="${c[0]-ring-10}" y="${c[1]-4}" text-anchor="end">Identity<tspan x="${c[0]-ring-10}" dy="15">service</tspan></text>`,label([180,40],'Your communities'),label([180,466],'Websites'),...parts.moving];
  return svg('geo geo-hero geo-hero-tall',360,480,body.join(''),parts.defs.join(''));
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
  websites(){const boxes=[[[62,130],'left','coral','Robin','4f2c…'],[[180,130],'right','amber','R.','a91e…'],[[298,130],'top','blue','Rob','7d03…']];
    return svg('geo geo-chapter',360,260,boxes.map(([at,side,colour,name,id])=>site(at,{side,colour,name,id,w:100,h:100})).join(''));},
  // The overview's hero: one cube, three websites, each linked to the face it is shown.
  faces(){const you=[180,62],boxes=[[[62,196],'left','coral','Robin','4f2c…'],[[180,196],'right','amber','R.','a91e…'],[[298,196],'top','blue','Rob','7d03…']],defs=[],lines=[];
    boxes.forEach(([at,,colour],i)=>{const seg=trim(you,at,38,54);defs.push(gradient('ov'+i,seg,'line','face-'+colour));lines.push(link(seg,'draw d1','ov'+i));});
    return svg('geo geo-chapter',360,260,[...lines,cube(you[0],you[1],32,{top:'keep',left:'coral',right:'amber'}),...boxes.map(([at,side,colour,name,id])=>site(at,{side,colour,name,id,w:100,h:100}))].join(''),defs.join(''));},
  operators(){const community=[92,118],own=[268,118];
    return svg('geo geo-chapter',360,260,[`<circle class="service host" cx="${community[0]}" cy="${community[1]}" r="58"/>`,`<circle class="service host" cx="${own[0]}" cy="${own[1]}" r="58"/>`,
      cube(community[0],community[1]-12,17),cube(community[0]-24,community[1]+22,11,{top:'keep',left:'mute',right:'mute2'}),cube(community[0]+24,community[1]+22,11,{top:'keep',left:'mute',right:'mute2'}),
      cube(own[0],own[1],20),`<text class="or" x="180" y="${own[1]+5}" text-anchor="middle">or</text>`,
      label([community[0],204],'Community host'),label([own[0],204],'Your own host')].join(''));}};

// The member introduction (/learn): the same vocabulary, with text explaining every step.
export function learnArt() {
  const w=280,h=170,small=([x,y],side,colour)=>`<g class="site"><rect class="node" x="${x-30}" y="${y-19}" width="60" height="38" rx="10"/>${face(side,colour,x,y,11)}</g>`;
  const signIn=(()=>{const c=[62,85],ring=40,to=[[[222,30],'left','coral'],[[222,85],'right','amber'],[[222,140],'top','blue']],defs=[],lines=[];
    to.forEach(([at,,colour],i)=>{const seg=trim(c,at,ring,34);defs.push(gradient('ls'+i,seg,'line','face-'+colour));lines.push(link(seg,'',`ls${i}`));});
    return svg('geo',w,h,[`<circle class="service" cx="${c[0]}" cy="${c[1]}" r="${ring}"/>`,...lines,cube(c[0],c[1],22),...to.map(([at,side,colour])=>small(at,side,colour))].join(''),defs.join(''));})();
  const choose=(()=>{const you=[52,66],at=[52,134];
    return svg('geo',w,h,[`<path class="tether" d="M52 90V${at[1]-16}"/>`,cube(you[0],you[1],22),
      `<circle class="email" cx="${at[0]}" cy="${at[1]}" r="14"/><text class="at" x="${at[0]}" y="${at[1]+5}" text-anchor="middle">@</text>`,lock([at[0]+21,at[1]-11]),
      tick([112,48],true),face('left','coral',138,48,11),tick([112,84],true),token([138,84],'a',12),
      link([[160,66],[176,66]],''),site([224,66],{side:'left',colour:'coral',name:'Robin',shares:['a'],w:84,h:84})].join(''));})();
  const review=(()=>{const c=[60,85],ring=38,parts={defs:[],lines:[],marks:[],moving:[]},sites=[{at:[220,42],side:'left',colour:'coral',name:'Robin',shares:['a']},{at:[220,130],off:true,note:'Disconnected'}];
    outgoing('lr',c,ring,sites,parts,0,48);
    return svg('geo',w,h,[`<circle class="service" cx="${c[0]}" cy="${c[1]}" r="${ring}"/>`,...parts.lines,cube(c[0],c[1],21),...parts.marks,...sites.map(s=>site(s.at,{...s,w:88,h:76}))].join(''),parts.defs.join(''));})();
  return [signIn,choose,review];
}
// What one website receives, as a glyph: its face of you, and a membership when one is ticked.
export const receiptArt=()=>svg('geo receipt-art',64,32,face('left','coral',16,16,13)+`<g class="receipt-token">${token([48,16],'a',15)}</g>`);

export function homePage(config,{assets='/assets/'}={}) {
  const page=render(template('home.html'),{assets,guides:'/docs/',account_url:memberAccountURL(config),developers:developerURL(config)});
  return page.replace('<!--hero-->',heroWide()+heroTall()).replace(/<!--chapter:([a-z]+)-->/g,(_m,name)=>chapters[name]());
}
// Written by the build next to the WordPress package; absent in an unbuilt checkout.
const release=()=>{try{return JSON.parse(readFileSync(new URL('../dist/release.json',import.meta.url),'utf8'));}catch{return {};}};
export function developerPage(config,{assets=(config.basePath??'/identity')+'/assets/',home=config.publicDocs?'/learn':config.accountSource==='frrn'?config.origin+'/':(config.basePath??'/identity')+'/'}={}) {
  const base=config.basePath??'/identity',built=release(),frrn=config.accountSource==='frrn';
  return render(template('developers.html'),{assets,home,home_label:config.publicDocs?'How it works':displayName(config)+' ↗',home_footer:config.publicDocs?'How it works':'Back to '+displayName(config),developer_home:config.publicDocs?'/':developerURL(config),brand:displayName(config),issuer:config.issuer??'Supplied by your operator',
    scopes:config.contract==='legacy-firn'?'openid profile drop_identity drop_memberships':'openid profile identity.v1 memberships.v1',
    contract:config.contract??'community-v1',wordpress_download:base+'/wordpress.zip',download_hidden:config.demo||config.wordpressDownload?'':'hidden',
    documentation:base+'/docs/'+(frrn?'frrn-host':'hosting'),contract_doc:base+'/docs/contract',guides:base+'/docs/',websites_guide:base+'/docs/websites',operators_guide:base+'/docs/operators',
    release_notes:base+'/docs/release-notes',version:built.version??'',wordpress_checksum:built.wordpress_sha256??'',
    tested_wordpress:built.tested?.wordpress??'',tested_generic:built.tested?.openid_connect_generic??'',
    example_url:exampleClient(config)?exampleURL(config):'',example_hidden:exampleClient(config)?'':'hidden',
    organiser_screen:frrn?'organiser-frrn.png':'organiser-standalone.png',
    organiser_alt:frrn?'A FRRN community’s management page. Under Membership approvals, each member is listed with an Approve membership or Withdraw approval button.'
      :'An organisation’s administration page. The administrator enters a member’s email address, optionally sets an end date, and approves or revokes memberships.'}).replace(/<!--chapter:([a-z]+)-->/g,(_m,name)=>chapters[name]());
}
// Single pieces of the vocabulary for HTML pages that draw their own layout.
export const glyphs={
  cube:(s=34)=>svg('geo glyph-cube',n(1.732*s+4),2*s+4,cube(n(.866*s+2),s+2,s)),
  you:(r=70,s=34)=>svg('geo glyph-you',2*r+4,2*r+4,`<circle class="service" cx="${r+2}" cy="${r+2}" r="${r}"/>`+cube(r+2,r+2,s)),
  face:(side,colour,s=14)=>svg('geo glyph-face',2*s,2*s,face(side,colour,s,s,s)),
  community:(size=40)=>svg('geo glyph-community',size+4,size+4,org([size/2+2,size/2+2],'x',size)),
  token:(size=12,round=false)=>svg('geo glyph-token',size,size,round?`<circle class="token" cx="${size/2}" cy="${size/2}" r="${size/2-1}"/>`:token([size/2,size/2],'x',size)),
  email:()=>svg('geo glyph-email',58,34,`<circle class="email" cx="17" cy="17" r="15"/><text class="at" x="17" y="22" text-anchor="middle">@</text>`+lock([44,13]))
};

// Shared private member shell: home and complete lists use the same navigation and palette.
export function memberPage(config,title,body,{csrf,canSignOut,current='account',directory=false,access=false}={}) {
  const base=config.basePath??'/identity',brand=escape(displayName(config));
  const mark=['Unanym','FRRN'].includes(displayName(config))?brand.toLowerCase():brand,frrn=config.accountSource==='frrn';
  const exit=canSignOut?`<form method="post" action="${base}/logout"><input type="hidden" name="csrf" value="${escape(csrf(base+'/logout'))}"><button class="pill">Sign out</button></form>`
    :frrn?'<a class="pill" href="/account">FRRN account <span aria-hidden="true">↗</span></a>':'';
  const privacy=config.publicDocs?base+'/learn#privacy':base+'/about';
  const navigation=access?`<a href="${base}/learn" ${current==='learn'?'aria-current="page"':''}>How it works</a><a href="${escape(memberAccountURL(config))}">Sign in</a>`:`<a href="${base}/account" ${current==='account'?'aria-current="page"':''}>Your ${brand}</a>${directory?`<span aria-current="page">${current==='sites'?'Websites':'Memberships &amp; confirmations'}</span>`:''}${exit}`;
  return versionAssets(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · ${brand}</title><link rel="stylesheet" href="${base}/assets/front.css"><link rel="icon" href="${base}/assets/favicon.svg" type="image/svg+xml"></head><body class="developer member${directory?' member-directory':''}">
  <a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="wordmark" href="${base}/" aria-label="${brand} home"><img src="${base}/assets/front-mark.svg" alt="" width="25" height="32">${mark}</a><nav class="doc-nav member-nav" aria-label="${access?'Main':'Account'}">${navigation}</nav></header>
  ${config.demo?'<aside class="member-demo">Local demonstration · fictional accounts</aside>':''}
  <main id="main">${body}</main>
  <footer class="site-footer"><span>One you. Many places.</span><div><a href="${privacy}">Privacy</a><a href="${base}/learn">Help</a></div></footer></body></html>`);
}
