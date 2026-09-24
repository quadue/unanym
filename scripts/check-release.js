// Conservative tracked-file checks. This does not replace a security review.
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.');
let files;
try{files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).split('\0').filter(Boolean);}
catch{files=[];const walk=dir=>{for(const name of readdirSync(dir)){if(['.git','node_modules','data','dist','test-results','playwright-report'].includes(name))continue;const p=resolve(dir,name);if(lstatSync(p).isDirectory())walk(p);else files.push(relative(root,p));}};walk(root);}
for(const path of files){
 if(/(^|\/)(?:\.env(?:\..*)?|data|node_modules|\.gitea)(\/|$)|\.(?:db|sqlite|pem|key)$/i.test(path))throw Error('Private/runtime path tracked: '+path);
 if(lstatSync(path).isSymbolicLink())throw Error('Review symlink before release: '+path);
 const text=readFileSync(path,'utf8');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(text))throw Error('Possible credential in '+path);
 if(/cocounsel\.live|\/home\/ana\/|45\.131\.66\.22|git\.frrn\.life/.test(text))throw Error('Private deployment reference in '+path);
}
const vendor=JSON.parse(readFileSync('vendor/frrn-kernel/provenance.json'));
for(const [name,expected]of Object.entries(vendor.files))if(createHash('sha256').update(readFileSync('vendor/frrn-kernel/'+name)).digest('hex')!==expected)throw Error('Vendor provenance mismatch: '+name);
if(JSON.parse(readFileSync('clients.json')).length!==0)throw Error('Do not publish real client registrations');
console.log('Tracked-file boundary and pinned kernel checks passed; independent review remains required.');
