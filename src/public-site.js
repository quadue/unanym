// Public documentation only. No accounts, keys, client registry or identity DB.
import express from 'express';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {developerPage} from './presentation.js';
import {docsIndex,guidePage,guideNames,referencePage,referenceDocs} from './portal.js';
import {learnView} from './learn-view.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export function createPublicSite({origin='https://unanym.org'}={}) {
  const config={publicDocs:true,origin,basePath:'',developerURL:'/',displayName:'Unanym',
    contract:'community-v1',operatorName:'your identity service operator',
    issuer:'Supplied by your identity operator',clients:[],wordpressDownload:true};
  const app=express();app.disable('x-powered-by');
  app.use((_req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
    next();
  });
  app.get('/',(_req,res)=>res.send(developerPage(config)));
  app.get('/learn',(_req,res)=>res.send(learnView(config)));
  app.get('/docs/',(_req,res)=>res.send(docsIndex(config)));
  for(const name of guideNames)app.get('/docs/'+name,(_req,res)=>res.send(guidePage(config,name)));
  for(const name of Object.keys(referenceDocs))app.get('/docs/'+name,(_req,res)=>res.send(referencePage(config,name)));
  for(const [name,file] of Object.entries({'community-v1.md':'docs/contracts/community-v1.md','standalone.md':'docs/standalone.md'}))
    app.get('/docs/'+name,(_req,res)=>res.type('text/plain').sendFile(resolve(root,file)));
  app.get('/wordpress.zip',(_req,res)=>res.download(resolve(root,'dist/wordpress.zip'),'unanym-wordpress.zip'));
  app.use('/assets',express.static(resolve(root,'dist/assets'),{index:false,dotfiles:'deny'}));
  app.get('/health',(_req,res)=>res.json({service:'unanym-public-site',version:JSON.parse(readFileSync(resolve(root,'package.json'))).version}));
  // Keep incoming documentation links from the old public host useful.
  app.get('/identity/v1/developers',(_req,res)=>res.redirect(308,'/'));
  app.get('/identity/v1/docs/:name',(req,res)=>res.redirect(308,'/docs/'+encodeURIComponent(req.params.name)));
  app.get('/identity/v1/wordpress.zip',(_req,res)=>res.redirect(308,'/wordpress.zip'));
  app.use((_req,res)=>res.status(404).type('text/plain').send('Page not found. Visit / for Unanym guides.'));
  return app;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createPublicSite({origin:process.env.PUBLIC_ORIGIN??'https://unanym.org'});
  const server=app.listen(Number(process.env.PORT??4386),process.env.HOST??'127.0.0.1',()=>console.log('Unanym public site listening'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
