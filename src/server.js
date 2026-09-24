import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration} from './config.js';
import {pactAdapter} from './pact.js';
import {createService} from './service.js';

// Compatibility entry point for existing hosts. New hosts import service.js.
export {createService};

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const config=configuration();
  if(!config.pactDb || !config.pactMode)throw new Error('PACT_DB_PATH and PACT_MODE_FILE are required');
  const service=createService(config,pactAdapter({path:config.pactDb,modeFile:config.pactMode}));
  const server=service.app.listen(config.port,config.host,()=>console.log('Unanym listening on port',config.port));
  process.on('SIGTERM',()=>server.close(()=>{service.close();process.exit(0);}));
}
