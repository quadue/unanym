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
// The public project home (unanym.org): the shape of the system, few words.
// Details live on /overview, /learn and /developers.
export function homePage(config,{assets='/assets/'}={}) {
  const page=render(template('home.html'),{assets,guides:'/docs/',developers:developerURL(config)});
  return page.replace('<!--geometry-->',geometry('wide')+geometry('tall'));
}
export function overviewPage(config,{assets='/assets/'}={}) {
  const built=release();
  return render(template('overview.html'),{assets,guides:'/docs/',developers:developerURL(config),version:built.version??'',
    tested_wordpress:built.tested?.wordpress??'',tested_generic:built.tested?.openid_connect_generic??''});
}
// Two communities approve; you hold both memberships in your identity service;
// each website receives only what you send it and sees its own "you" (a
// different identifier and name). The third website receives nothing.
const layouts={
  wide:{w:1200,h:540,orgs:[[150,180],[150,360]],you:[600,270],ring:92,sites:[[1030,110],[1030,270],[1030,430]],site:[124,88],
    captions:[[150,512,'Communities approve'],[600,512,'You choose what goes where'],[1030,512,'Each website meets a different you']],service:[600,392]},
  tall:{w:420,h:900,orgs:[[130,120],[290,120]],you:[210,420],ring:88,sites:[[75,735],[210,735],[345,735]],site:[104,84],
    captions:[[210,48,'Communities approve'],[210,568,'You choose what goes where'],[210,862,'Each website meets a different you']],service:[210,538]}};
const sites=[{shares:['a'],face:1},{shares:['a','b'],face:2},{shares:[],face:0}];
const orgKeys=['a','b'];
const n=v=>Math.round(v*10)/10;
// Endpoints trimmed so lines meet shapes instead of their centres.
const segment=([x1,y1],[x2,y2],from,to)=>{const d=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/d,uy=(y2-y1)/d;
  return `M${n(x1+ux*from)} ${n(y1+uy*from)}L${n(x2-ux*to)} ${n(y2-uy*to)}`;};
const token=(x,y,key,size,extra='')=>`<rect class="token org-${key}${extra}" x="${n(x-size/2)}" y="${n(y-size/2)}" width="${size}" height="${size}" rx="3"/>`;
const face=(kind,x,y)=>kind===1?`<path class="face face-1" d="M${x} ${y-17}L${x+17} ${y+12}H${x-17}Z"/>`
  :kind===2?`<path class="face face-2" d="M${x} ${y-17}L${x+17} ${y}L${x} ${y+17}L${x-17} ${y}Z"/>`:'';
function geometry(kind) {
  const L=layouts[kind],[yx,yy]=L.you,[sw,sh]=L.site,parts=[];
  L.orgs.forEach((o,i)=>parts.push(`<path class="link in org-${orgKeys[i]} draw d1" pathLength="1" d="${segment(o,L.you,36,L.ring)}"/>`));
  sites.forEach((site,i)=>parts.push(`<path class="link out${site.shares.length?' draw d3':' off appear d3'}" pathLength="1" d="${segment(L.you,L.sites[i],L.ring,Math.min(sw,sh)/2+4)}"/>`));
  parts.push(`<circle class="service" cx="${yx}" cy="${yy}" r="${L.ring}"/><text class="small" x="${L.service[0]}" y="${L.service[1]}" text-anchor="middle">identity service</text>`);
  L.orgs.forEach(([x,y],i)=>parts.push(`<g class="org org-${orgKeys[i]}"><rect x="${x-28}" y="${y-28}" width="56" height="56" rx="12"/>${token(x,y,orgKeys[i],16)}</g>`));
  parts.push(`<circle class="you" cx="${yx}" cy="${yy}" r="40"/>`+orgKeys.map((k,i)=>token(yx-11+i*22,yy,k,16,' appear d2')).join(''));
  sites.forEach((site,i)=>{const [x,y]=L.sites[i];
    parts.push(`<g class="site${site.shares.length?'':' off'}"><rect x="${n(x-sw/2)}" y="${n(y-sh/2)}" width="${sw}" height="${sh}" rx="16"/>`+
      (site.shares.length?`<g class="appear d4">${face(site.face,x,y-10)}${site.shares.map((k,j)=>token(x-(site.shares.length-1)*9+j*18,y+24,k,12)).join('')}</g>`:'')+'</g>');});
  L.captions.forEach(([x,y,text])=>parts.push(`<text class="caption" x="${x}" y="${y}" text-anchor="middle">${text}</text>`));
  return `<svg class="geo geo-${kind}" viewBox="0 0 ${L.w} ${L.h}" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
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
