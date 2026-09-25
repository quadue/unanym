import {readFileSync} from 'node:fs';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const displayName=config=>config.displayName??'FRRN';
export const developerURL=config=>config.developerURL??(config.basePath??'/identity')+'/developers';
const template=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
const render=(source,values)=>source.replace(/\{\{([a-z_]+)\}\}/g,(_match,key)=>escape(values[key]??''));
export function frontPage(config,{assets=(config.basePath??'/identity')+'/assets/',home='/',signIn=(config.basePath??'/identity')+'/account'}={}) {
  return render(template('front.html'),{brand:displayName(config),brand_mark:displayName(config)==='FRRN'?'frrn':displayName(config),assets,home,sign_in:signIn,developers:developerURL(config),privacy:(config.basePath??'/identity')+'/about'});
}
export function developerPage(config,{assets=(config.basePath??'/identity')+'/assets/',home=config.accountSource==='frrn'?config.origin+'/':(config.basePath??'/identity')+'/'}={}) {
  return render(template('developers.html'),{assets,home,brand:displayName(config),issuer:config.issuer??'Supplied by your operator',
    scopes:config.contract==='legacy-firn'?'openid profile drop_identity drop_memberships':'openid profile identity.v1 memberships.v1',
    contract:config.contract??'community-v1',wordpress_download:(config.basePath??'/identity')+'/wordpress.zip',download_hidden:config.demo||config.wordpressDownload?'':'hidden',documentation:(config.basePath??'/identity')+'/docs/standalone.md',contract_doc:(config.basePath??'/identity')+'/docs/community-v1.md'});
}
