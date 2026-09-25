import {readFileSync,mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,generateKeyPairSync} from 'node:crypto';

export function configuration(env=process.env) {
  const contract=env.IDENTITY_CONTRACT??'legacy-firn';
  if(!['legacy-firn','community-v1'].includes(contract))throw new Error('Unknown identity contract');
  const basePath=identityBasePath(env.IDENTITY_BASE_PATH);
  if(contract==='legacy-firn' && basePath!=='/identity')throw new Error('Preserve the legacy issuer path');
  const operatorName=env.IDENTITY_OPERATOR_NAME?.trim();
  const displayName=env.IDENTITY_DISPLAY_NAME?.trim()||'FRRN';
  if(displayName.length>60||/[\x00-\x1f\x7f]/.test(displayName))throw new Error('Invalid member-facing name');
  const developerURL=env.IDENTITY_DEVELOPER_URL??basePath+'/developers';
  if(developerURL!==basePath+'/developers'){
    const u=new URL(developerURL);
    if(u.username||u.password||u.hash||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw new Error('Invalid developer documentation URL');
  }
  if(contract==='community-v1'&&(!env.IDENTITY_ORIGIN||!operatorName||operatorName.length>120))throw new Error('Standalone hosts need IDENTITY_ORIGIN and IDENTITY_OPERATOR_NAME');
  const origin=env.IDENTITY_ORIGIN ?? 'http://localhost:4080';
  const parsed=new URL(origin);
  if(parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error('IDENTITY_ORIGIN must be an origin');
  if(parsed.protocol!=='https:' && !(parsed.protocol==='http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new Error('HTTPS required outside localhost');
  const dir=resolve(env.IDENTITY_DATA_DIR ?? './data'); mkdirSync(dir,{recursive:true,mode:0o700});
  if(contract==='community-v1')chmodSync(dir,0o700);
  if(existsSync(resolve(dir,'profile.json'))){
    const saved=JSON.parse(readFileSync(resolve(dir,'profile.json'),'utf8'));
    if(saved.contract!==contract||saved.issuer!==origin+basePath+'/oidc')throw new Error('Existing standalone data requires its original contract and issuer');
  }
  const keyPath=resolve(dir,'keys.json');
  if(!existsSync(keyPath)) {
    const oidc=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'jwk'});
    Object.assign(oidc,{use:'sig',alg:'RS256',kid:randomBytes(12).toString('hex')});
    const drop=generateKeyPairSync('ed25519').privateKey.export({format:'jwk'});
    writeFileSync(keyPath,JSON.stringify({oidc,drop,cookie:randomBytes(32).toString('base64url'),encryption:randomBytes(32).toString('base64url')}),{mode:0o600,flag:'wx'});
  }
  const keys=JSON.parse(readFileSync(keyPath,'utf8'));
  const clients=JSON.parse(readFileSync(env.IDENTITY_CLIENTS ?? './clients.json','utf8'));
  const secrets=env.IDENTITY_CLIENT_SECRETS ? JSON.parse(readFileSync(env.IDENTITY_CLIENT_SECRETS,'utf8')) : {};
  registeredClients(clients,secrets);
  return {origin,basePath,wordpressDownload:contract==='community-v1'&&env.IDENTITY_WORDPRESS_DOWNLOAD==='1',issuer:origin+basePath+'/oidc',dir,keys,clients,contract,operatorName,displayName,developerURL,port:Number(env.PORT ?? 4080),host:env.HOST ?? '127.0.0.1',
    pactDb:env.PACT_DB_PATH,pactMode:env.PACT_MODE_FILE,
    demo:env.IDENTITY_DEMO==='1' && ['localhost','127.0.0.1'].includes(parsed.hostname)};
}

export function registeredClients(clients,secrets={}) {
  const sectors=new Set();
  for(const c of clients) {
    if(Object.hasOwn(c,'client_secret'))throw new Error('Store client secrets in IDENTITY_CLIENT_SECRETS, never in the registry');
    c.token_endpoint_auth_method ??= 'none';
    if(c.allow_refresh!==undefined && typeof c.allow_refresh!=='boolean')throw new Error('allow_refresh must be boolean');
    if(c.allow_confirmations!==undefined && typeof c.allow_confirmations!=='boolean')throw new Error('allow_confirmations must be boolean');
    if(c.allow_wallet_memberships!==undefined && typeof c.allow_wallet_memberships!=='boolean')throw new Error('allow_wallet_memberships must be boolean');
    if(!['none','client_secret_basic','client_secret_post'].includes(c.token_endpoint_auth_method))throw new Error('Unsupported client authentication method');
    if(c.token_endpoint_auth_method!=='none') {
      c.client_secret=secrets[c.client_id];
      if(typeof c.client_secret!=='string' || c.client_secret.length<32)throw new Error('Missing strong secret for server-side website '+c.client_id);
    }else if(c.allow_refresh)throw new Error('Only server-side websites may request renewable sessions');
    if(!/^[a-z0-9-]{2,60}$/.test(c.client_id) || !c.name || !Array.isArray(c.redirect_uris) || !c.redirect_uris.length) throw new Error('Invalid registered website');
    for(const u of c.redirect_uris) {
      const url=new URL(u);
      if(url.hash || url.username || url.password || (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid redirect URI');
    }
    const hosts=new Set(c.redirect_uris.map(u=>new URL(u).hostname));
    if(hosts.size!==1 || sectors.has([...hosts][0]))throw new Error('Pilot registration requires one distinct hostname per website; shared OIDC sectors need an explicit migration');
    sectors.add([...hosts][0]);
    const homepage=new URL(c.homepage);
    if(!c.redirect_uris.some(u=>new URL(u).origin===homepage.origin))throw new Error('Homepage must belong to the registered website');
    if(c.sharing_uri!==undefined){
      const sharing=new URL(c.sharing_uri);
      if(sharing.origin!==homepage.origin||sharing.username||sharing.password||sharing.hash)throw new Error('Sharing address must belong to the registered website');
    }
  }
  if(new Set(clients.map(c=>c.client_id)).size!==clients.length) throw new Error('Duplicate client');
  return clients;
}

// A separate v1 mount lets an existing legacy issuer keep its URL and subjects.
export function identityBasePath(value='/identity') {
  if(!['/identity','/identity/v1'].includes(value))throw new Error('Unsupported identity base path');
  return value;
}
