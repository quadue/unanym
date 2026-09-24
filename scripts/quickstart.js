// Explicit fictional loopback demo. Production uses the standalone entry point.
import {execFileSync} from 'node:child_process';
if(Number(process.versions.node.split('.')[0])<24)throw Error('Install Node.js 24 or newer first');
const npm=process.platform==='win32'?'npm.cmd':'npm';
execFileSync(npm,['ci'],{stdio:'inherit'});
execFileSync(npm,['run','build'],{stdio:'inherit'});
process.env.UNANYM_DEMO_ACCOUNT_SOURCE='independent';
await import('./demo.js');
