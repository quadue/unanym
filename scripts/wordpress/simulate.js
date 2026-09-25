// Repeatable local rehearsal with two separate WordPress databases/sites.
// Only labelled fictional labs are touched; FRRN runtime data is never opened.
import {execFileSync,spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {once} from 'node:events';
const root=process.env.FRRN_APP_ROOT;
if(!root||!existsSync(resolve(root,'src/server/db.ts')))throw Error('Set FRRN_APP_ROOT to a FRRN source checkout with community introductions.');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:'inherit',...options});
const inspect=name=>{try{return JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8',stdio:['pipe','pipe','pipe']}))[0];}catch{return null;}};
const started=[];
try{
 run('npm',['run','build'],{cwd:root});run('npm',['run','build']);
 for(const [name,host,port,dbPort]of [['unanym-frrn','localhost',4342,43308],['unanym-second','127.0.0.1',4343,43436]]){
  const wp=inspect(name+'-wp'),db=inspect(name+'-wp-db');
  for(const c of [wp,db].filter(Boolean))if(c.Config.Labels?.['life.frrn.drop.rehearsal']!=='wordpress')throw Error('Refusing an unlabelled container');
  if(wp&&wp.Mounts.find(m=>m.Destination==='/var/www/html/wp-content/plugins/drop-identity')?.Source!==resolve('integrations/wordpress/drop-identity'))throw Error('Lab uses another source checkout');
  if(!wp&&!db){
   started.push(name+'-wp-db',name+'-wp');
   run('bash',['scripts/wordpress/lab.sh','start'],{env:{...process.env,UNANYM_LAB_NAME:name,UNANYM_WP_HOST:host,UNANYM_WP_PORT:String(port),UNANYM_DB_PORT:String(dbPort)}});
  }else{
   if(!wp||!db)throw Error('Incomplete fictional lab; inspect it before retrying');
   for(const c of [db,wp])if(!c.State.Running){run('docker',['start',c.Name.slice(1)]);started.push(c.Name.slice(1));}
  }
 }
 const child=spawn(process.execPath,['scripts/wordpress/frrn-rehearse.js'],{stdio:'inherit',env:{...process.env,FRRN_APP_ROOT:resolve(root),FRRN_TWO_SITES:'1',FRRN_CONFIRMATIONS:'1',IDENTITY_BASE_PATH:'/identity/v1'}});
 const [code]=await once(child,'exit');if(code!==0)throw Error('WordPress simulation failed');
 console.log('Evidence: data/unanym-frrn-wordpress-lab/evidence/two-sites.json');
}finally{
 for(const name of started.reverse())if(inspect(name))run('docker',['stop',name]);
}
