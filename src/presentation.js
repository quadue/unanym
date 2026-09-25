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
// Written by the build next to the WordPress package; absent in an unbuilt checkout.
const release=()=>{try{return JSON.parse(readFileSync(new URL('../dist/release.json',import.meta.url),'utf8'));}catch{return {};}};
export function developerPage(config,{assets=(config.basePath??'/identity')+'/assets/',home=config.publicDocs?'/learn':config.accountSource==='frrn'?config.origin+'/':(config.basePath??'/identity')+'/'}={}) {
  const base=config.basePath??'/identity',built=release(),frrn=config.accountSource==='frrn';
  return render(template('developers.html'),{assets,home,home_label:config.publicDocs?'Member walkthrough':displayName(config)+' ↗',home_footer:config.publicDocs?'Try the member walkthrough':'Back to '+displayName(config),developer_home:developerURL(config),brand:displayName(config),issuer:config.issuer??'Supplied by your operator',
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
