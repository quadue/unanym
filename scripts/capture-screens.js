// Regenerates the developer overview's screenshots from fictional local data.
// Usage: npm run build && node scripts/capture-screens.js
// Optional: FRRN_APP_ROOT=/path/to/frrn-app (built) adds the FRRN organiser screen.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';

const out='web/screens/',size={width:1200,height:750};
const scratch=mkdtempSync(join(tmpdir(),'unanym-screens-'));
const wait=async url=>{for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('Timed out waiting for '+url);};
const stop=child=>new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');});
const browser=await chromium.launch();
const shot=async(page,name)=>{await page.screenshot({path:out+name});console.log('Wrote',out+name);};

async function memberScreens() {
  const port=4680,origin='http://localhost:'+port;
  const demo=spawn(process.execPath,['scripts/demo-v1.js'],{env:{...process.env,UNANYM_DEMO_PORT:String(port),UNANYM_DEMO_SITE_PORT:String(port+1),UNANYM_DEMO_DATA_DIR:join(scratch,'demo')},stdio:'ignore'});
  try{
    await wait(origin+'/identity/health');
    const page=await browser.newPage({viewport:size});
    await page.goto(origin+'/identity/example/');await page.getByRole('link',{name:/Continue with/}).click();
    await page.getByRole('button',{name:'Continue as Robin'}).click();
    await page.getByLabel('Your name on this website').fill('Robin');await page.getByRole('checkbox',{name:/Lakeside/}).check();
    await page.evaluate(()=>window.scrollTo(0,0));await shot(page,'consent.png');
    await page.getByRole('button',{name:'Allow and continue'}).click();await page.waitForURL('**/example/callback**');
    await shot(page,'received.png');
    await page.goto(origin+'/identity/sites');await shot(page,'connections.png');
  }finally{await stop(demo);}
}

async function standaloneOrganiser() {
  const dir=join(scratch,'standalone'),mail=new Map(),server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,clients=join(scratch,'clients.json');writeFileSync(clients,'[]');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:origin,IDENTITY_OPERATOR_NAME:'Example operator',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:dir});
  const service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.set(m.email,m.code)});
  server.on('request',service.app);
  try{
    const login=async(page,email)=>{await page.goto(origin+'/identity/login');await page.getByLabel('Email address').fill(email);await page.getByRole('button',{name:'Send code',exact:true}).click();
      await page.getByLabel('Sign-in code').fill(mail.get(email));await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/identity/account');};
    const operator=await browser.newPage({viewport:size});await login(operator,'operator@example.test');
    await operator.getByRole('link',{name:'Register an organisation',exact:true}).click();
    await operator.getByLabel('Organisation name').fill('Lakeside community');await operator.getByLabel('Administrator email').fill('organiser@example.test');
    await operator.getByLabel('Authorisation reference').fill('Fictional appointment for screenshots');await operator.getByRole('button',{name:'Register organisation',exact:true}).click();
    const admin=await browser.newPage({viewport:size});await login(admin,'organiser@example.test');await admin.getByRole('link',{name:'Lakeside community',exact:true}).click();
    for(const email of ['robin@example.test','sam@example.test']){await admin.getByLabel('Member email').fill(email);await admin.getByRole('button',{name:'Approve membership',exact:true}).click();await admin.getByText(email,{exact:true}).waitFor();}
    await admin.getByText('Member email',{exact:true}).evaluate(el=>{document.documentElement.style.scrollBehavior='auto';el.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy(0,-40);});
    await admin.waitForTimeout(300);
    await shot(admin,'organiser-standalone.png');
  }finally{await new Promise(r=>server.close(r));service.close();}
}

async function frrnOrganiser(root) {
  const port=4690,origin='http://localhost:'+port;
  // Its own process group, so stopping it also stops the server npm starts.
  const app=spawn('npm',['run','community:review'],{cwd:root,env:{...process.env,FRRN_REVIEW_PORT:String(port)},stdio:'ignore',detached:true});
  try{
    await wait(origin+'/');
    const page=await browser.newPage({viewport:size});
    await page.goto(origin+'/?signin=1');await page.locator('#door-email').fill('organiser@example.test');
    await page.getByRole('button',{name:'Send my sign-in link'}).click();await page.getByRole('link',{name:'Continue in local preview'}).click();
    await page.goto(origin+'/c/learning-exchange/manage');
    const approvals=page.locator('#membership-approvals');await approvals.locator('summary').click();
    const rob=approvals.locator('.resource-permission',{hasText:'Rob'}).first();
    if(await rob.getByRole('button',{name:'Approve membership'}).count())await rob.getByRole('button',{name:'Approve membership'}).click();
    // Reload without the "Saved" notice, open the section and bring it to the top.
    await page.goto(origin+'/c/learning-exchange/manage');
    await page.locator('#membership-approvals').evaluate(el=>{el.open=true;document.documentElement.style.scrollBehavior='auto';el.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy(0,-110);});
    await page.waitForTimeout(300);
    await shot(page,'organiser-frrn.png');
  }finally{await new Promise(r=>{app.once('exit',r);process.kill(-app.pid,'SIGTERM');});}
}

try{
  await memberScreens();
  await standaloneOrganiser();
  if(process.env.FRRN_APP_ROOT)await frrnOrganiser(process.env.FRRN_APP_ROOT);
  else console.log('FRRN_APP_ROOT not set; kept the existing organiser-frrn.png');
}finally{await browser.close();rmSync(scratch,{recursive:true,force:true});}
