import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,statSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';

const script=new URL('../scripts/delete-account.js',import.meta.url).pathname;

test('an account deleted on request leaves no records, is listed first, and stays deleted after a restore',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-delete-')),data=join(dir,'identity'),list=join(dir,'deletions.tsv'),mail=new Map();
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const clients=join(dir,'clients.json');writeFileSync(clients,'[]');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:'http://localhost:4080',IDENTITY_OPERATOR_NAME:'Fictional test operator',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:data});
  const start=()=>createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.set(m.email,m.code)});
  let service=start(),address=0;
  const signIn=async email=>{const {accounts}=service;accounts.db.prepare('DELETE FROM limits').run();const binding='delete-account-test-'.repeat(3),id=await accounts.requestCode(email,binding,'192.0.2.'+(++address));return accounts.verifyCode(id,mail.get(email),binding).account;};
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{env:{...process.env,IDENTITY_DATA_DIR:data},encoding:'utf8'});

  const operator=await signIn('operator@example.test');
  const org=service.accounts.createOrganisation(operator,{name:'Lakeside choir',adminEmail:'organiser@example.test',authorityNote:'Fictional appointment for this test'});
  const organiser=await signIn('organiser@example.test');
  const member=await signIn('member@example.test'),other=await signIn('other@example.test');
  for(const email of ['member@example.test','other@example.test'])service.accounts.approve(organiser,org,email);
  const {db:accounts}=service.accounts,identity=service.db;
  accounts.prepare('INSERT INTO passkey_users VALUES(?,?)').run(member,'handle-for-member');
  accounts.prepare("INSERT INTO audit(at,actor,action,target) VALUES(?,?,'passkey_added',?)").run(new Date().toISOString(),member,member);
  for(const account of [member,other]){
    identity.prepare("INSERT INTO personas VALUES(?,'example-site',?,'key','event')").run(account,'subject-'+account);
    identity.prepare("INSERT INTO connections VALUES(?,'example-site','Robin','[]',NULL,1,?)").run(account,new Date().toISOString());
    identity.prepare("INSERT INTO oidc VALUES('Grant',?,?,NULL)").run('grant-'+account,JSON.stringify({accountId:account,clientId:'example-site'}));
  }
  // An unused sign-in code for the member is removed too.
  await service.accounts.requestCode('member@example.test','pending-code-binding-'.repeat(3),'192.0.2.200');

  // The host holds the data lock.
  const refused=run('--account',member,'--case','case-1','--list',list);
  assert.notEqual(refused.status,0);assert.match(refused.stderr,/Stop the standalone host/);
  service.close();

  const backup=join(dir,'backup');cpSync(data,backup,{recursive:true});
  assert.match(run('--account',organiser,'--case','case-0','--list',list).stderr,/hand over the role first/);
  assert.match(run('--account',operator,'--case','case-0','--list',list).stderr,/Operator accounts/);
  assert.match(run('--account',member,'--case','bad ref','--list',list).stderr,/Usage/);
  const deleted=run('--account',member,'--case','case-1','--list',list);
  assert.equal(deleted.status,0,deleted.stderr);

  const remaining=dbs=>{
    const a=new Database(join(dbs,'accounts.db'),{readonly:true}),i=new Database(join(dbs,'identity.db'),{readonly:true});
    try{
      const count=(db,sql,...v)=>db.prepare(sql).get(...v).n;
      return {
        accounts:count(a,'SELECT count(*) n FROM accounts WHERE id=?',member),
        own:['sessions','account_activity','passkey_users','memberships'].map(table=>count(a,`SELECT count(*) n FROM ${table} WHERE account=?`,member)).reduce((x,y)=>x+y),
        challenges:count(a,"SELECT count(*) n FROM challenges WHERE email='member@example.test'"),
        audit:count(a,'SELECT count(*) n FROM audit WHERE target=? AND organisation IS NULL',member),
        website:['personas','connections'].map(table=>count(i,`SELECT count(*) n FROM ${table} WHERE account=?`,member)).reduce((x,y)=>x+y)+count(i,"SELECT count(*) n FROM oidc WHERE json_extract(payload,'$.accountId')=?",member),
        other:count(a,'SELECT count(*) n FROM memberships WHERE account=?',other)+count(i,'SELECT count(*) n FROM personas WHERE account=?',other)+count(i,"SELECT count(*) n FROM oidc WHERE json_extract(payload,'$.accountId')=?",other),
        organisationAudit:count(a,"SELECT count(*) n FROM audit WHERE action='membership_approved' AND target=?",member)
      };
    }finally{a.close();i.close();}
  };
  assert.deepEqual(remaining(data),{accounts:0,own:0,challenges:0,audit:0,website:0,other:3,organisationAudit:1});
  const [entry]=readFileSync(list,'utf8').trim().split('\n').map(line=>line.split('\t'));
  assert.equal(entry[1],member);assert.equal(entry[2],'case-1');assert.equal(statSync(list).mode&0o777,0o600);
  assert.ok(!readFileSync(list,'utf8').includes('@'),'the list holds no email addresses');

  // A restore from the earlier backup brings the member back until the list is replayed.
  rmSync(data,{recursive:true});cpSync(backup,data,{recursive:true});
  assert.equal(remaining(data).accounts,1);
  const replayed=run('--replay',list,'--since',entry[0].slice(0,10));
  assert.equal(replayed.status,0,replayed.stderr);assert.match(replayed.stdout,/Deleted again 1 of 1/);
  assert.deepEqual(remaining(data),{accounts:0,own:0,challenges:0,audit:0,website:0,other:3,organisationAudit:1});
  assert.match(run('--replay',list,'--since','2999-01-01').stdout,/Deleted again 0 of 1/);

  // The person can start again with a fresh, empty account.
  service=start();
  const again=await signIn('member@example.test');
  assert.notEqual(again,member);assert.equal(service.accounts.adapter.memberships(again).length,0);
  service.close();
});
