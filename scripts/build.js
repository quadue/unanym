import {build} from 'esbuild';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {zipSync} from 'fflate';

for(const path of ['dist/assets','dist/example','dist/starter'])mkdirSync(path,{recursive:true});
await build({entryPoints:['web/client.js'],bundle:true,minify:true,format:'esm',target:'es2022',legalComments:'inline',outfile:'dist/assets/client.js'});
for(const file of ['style.css','learn.js','consent.js','front.css','front.js','front-mark.svg','front-mark-light.svg'])copyFileSync('web/'+file,'dist/assets/'+file);
copyFileSync('examples/community/index.html','dist/example/index.html');

// Legacy browser bundle is kept only so the compatibility tests exercise its real files.
for(const [source,dest]of [['examples/community/index.html','index.html'],['dist/assets/client.js','app.js'],['web/style.css','style.css'],['web/client.js','client-source.js'],['LICENSE','LICENSE'],['NOTICE','NOTICE'],['docs/static-html.md','SETUP-HTML.md']])copyFileSync(source,'dist/starter/'+dest);
writeFileSync('dist/starter/client-config.json',JSON.stringify({authority:'https://identity.example/identity/oidc',client_id:'UNCONFIGURED_FIXTURE',site_name:'Fictional community',redirect_uri:'https://website.example/identity/'},null,2));
writeFileSync('dist/starter/README.txt','Legacy regression fixture only. Not a supported onboarding package. The test host supplies its local configuration. Use the standalone WordPress guide for the supported pilot.\n');
writeFileSync('dist/starter.zip',zipSync(Object.fromEntries(['index.html','app.js','style.css','client-source.js','client-config.json','README.txt','SETUP-HTML.md','LICENSE','NOTICE'].map(name=>[name,readFileSync('dist/starter/'+name)]))));

const wordpress=['drop-identity.php','memberships.php','member-area.php','member.css','LICENSE','NOTICE'];
const files=Object.fromEntries(wordpress.map(name=>['drop-identity/'+name,readFileSync('integrations/wordpress/drop-identity/'+name)]));
files['drop-identity/frrn-host.md']=readFileSync('docs/frrn-host.md');
files['drop-identity/SETUP.md']=readFileSync('docs/standalone.md');files['drop-identity/CONTRACT.md']=readFileSync('docs/contracts/community-v1.md');
writeFileSync('dist/wordpress.zip',zipSync(files));
console.log('Built service assets, WordPress staging package and legacy regression fixture.');
