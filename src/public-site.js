// Public documentation only. No accounts, keys, client registry or identity DB.
import express from 'express';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {developerPage,homePage} from './presentation.js';
import {docsIndex,guidePage,guideNames,referencePage,referenceDocs} from './portal.js';
import {learnView} from './learn-view.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export function createPublicSite({origin='https://unanym.org',accountURL='https://unanym.org/identity/account',sourceURL='',communityURL=''}={}) {
  const account=new URL(accountURL);
  if(account.username||account.password||account.hash||(account.protocol!=='https:'&&!(account.protocol==='http:'&&['localhost','127.0.0.1'].includes(account.hostname))))throw new Error('Account URL must use HTTPS or a loopback host');
  const externalURL=(value,label)=>{
    if(!value)return '';
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error(label+' URL must use HTTPS without credentials, query or fragment');
    return url.href;
  };
  const config={publicDocs:true,origin,accountURL:account.href,sourceURL:externalURL(sourceURL,'Source'),communityURL:externalURL(communityURL,'Community'),basePath:'',developerURL:'/developers',displayName:'Unanym',
    contract:'community-v1',operatorName:'your identity service operator',
    issuer:'Supplied by your identity operator',clients:[],wordpressDownload:true};
  const app=express();app.disable('x-powered-by');
  app.use((_req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
    next();
  });
  app.get('/',(_req,res)=>res.send(homePage(config)));
  app.get('/overview',(_req,res)=>res.redirect(308,'/learn'));
  app.get('/developers',(_req,res)=>res.send(developerPage(config)));
  app.get('/learn',(_req,res)=>res.send(learnView(config)));
  app.get('/docs/',(_req,res)=>res.send(docsIndex(config)));
  app.get('/docs/members',(_req,res)=>res.redirect(308,'/learn'));
  for(const name of guideNames)app.get('/docs/'+name,(_req,res)=>res.send(guidePage(config,name)));
  for(const name of Object.keys(referenceDocs))app.get('/docs/'+name,(_req,res)=>res.send(referencePage(config,name)));
  for(const [name,file] of Object.entries({'community-v1.md':'docs/contracts/community-v1.md','standalone.md':'docs/standalone.md'}))
    app.get('/docs/'+name,(_req,res)=>res.type('text/plain').sendFile(resolve(root,file)));
  app.get('/wordpress.zip',(_req,res)=>res.download(resolve(root,'dist/wordpress.zip'),'unanym-wordpress.zip'));
  app.get('/docs/wordpress-trial-report.md',(_req,res)=>res.download(resolve(root,'docs/templates/wordpress-trial-report.md'),'unanym-wordpress-trial-report.md'));
  app.use('/assets',express.static(resolve(root,'dist/assets'),{index:false,dotfiles:'deny'}));
  app.get('/health',(_req,res)=>res.json({service:'unanym-public-site',version:JSON.parse(readFileSync(resolve(root,'package.json'))).version}));
  // Keep incoming documentation links from the old public host useful.
  app.get('/identity/v1/developers',(_req,res)=>res.redirect(308,'/developers'));
  app.get('/identity/v1/docs/:name',(req,res)=>res.redirect(308,'/docs/'+encodeURIComponent(req.params.name)));
  app.get('/identity/v1/wordpress.zip',(_req,res)=>res.redirect(308,'/wordpress.zip'));
  app.use((_req,res)=>res.status(404).type('text/plain').send('Page not found. Visit / for Unanym guides.'));
  return app;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createPublicSite({origin:process.env.PUBLIC_ORIGIN??'https://unanym.org',accountURL:process.env.PUBLIC_ACCOUNT_URL,sourceURL:process.env.PUBLIC_SOURCE_URL,communityURL:process.env.PUBLIC_COMMUNITY_URL});
  const server=app.listen(Number(process.env.PORT??4386),process.env.HOST??'127.0.0.1',()=>console.log('Unanym public site listening'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
