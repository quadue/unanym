// Loopback demo fixture: serve the actual downloadable archive as plain files.
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';

export function mountStaticStarter(site,{issuer,siteOrigin}) {
  const files=unzipSync(readFileSync('dist/starter.zip'));
  const config={authority:issuer,client_id:'sample-community',site_name:'HTML website trial',redirect_uri:siteOrigin+'/community-login/'};
  files['client-config.json']=new TextEncoder().encode(JSON.stringify(config));
  const serve=(res,file)=>{
    if(!Object.hasOwn(files,file))return res.sendStatus(404);
    return res.type(file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'text/plain').send(Buffer.from(files[file]));
  };
  site.get('/community-login/',(_req,res)=>serve(res,'index.html'));
  site.get('/community-login/:file',(req,res)=>serve(res,req.params.file));
  site.get('/old-site.html',(_req,res)=>res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Example community noticeboard</title></head><body><h1>Community noticeboard</h1><p>This fictional public page stands in for an older HTML website.</p><hr><p>Our public notices remain available without signing in.</p><p><a href="/community-login/">Connect your community identity</a></p></body></html>'));
}
