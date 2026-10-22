import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration} from '../src/config.js';
import {createStandalone} from '../src/standalone/server.js';

const YEAR=365*86_400_000;

test('accounts never used for anything are removed after a year without sign-in; every other account stays',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unanym-unused-')),mail=new Map();
  const clients=join(dir,'clients.json');writeFileSync(clients,'[]');
  const config=configuration({IDENTITY_CONTRACT:'community-v1',IDENTITY_ORIGIN:'http://localhost:4080',IDENTITY_OPERATOR_NAME:'Fictional test operator',IDENTITY_CLIENTS:clients,IDENTITY_DATA_DIR:join(dir,'identity')});
  const service=createStandalone(config,{bootstrapEmail:'operator@example.test',sendCode:async m=>mail.set(m.email,m.code)});
  t.after(()=>{service.close();rmSync(dir,{recursive:true,force:true});});
  const {accounts}=service,db=accounts.db;
  let address=0;
  const signIn=async email=>{db.prepare('DELETE FROM limits').run();const binding='unused-account-test-'.repeat(3),id=await accounts.requestCode(email,binding,'192.0.2.'+(++address));return accounts.verifyCode(id,mail.get(email),binding).account;};
  const idOf=email=>db.prepare('SELECT id FROM accounts WHERE email=?').get(email)?.id;
  // Move an account's last sign-in (and creation) into the past.
  const age=(email,ms,{activity=true}={})=>{const id=idOf(email),at=Date.now()-ms;
    db.prepare('UPDATE accounts SET created=? WHERE id=?').run(at,id);
    if(activity)db.prepare('UPDATE account_activity SET last_sign_in=? WHERE account=?').run(at,id);else db.prepare('DELETE FROM account_activity WHERE account=?').run(id);};

  const operator=await signIn('operator@example.test');
  const org=accounts.createOrganisation(operator,{name:'Lakeside choir',adminEmail:'organiser@example.test',authorityNote:'Fictional appointment for this test'});
  const organiser=await signIn('organiser@example.test');
  for(const email of ['idle@example.test','recent@example.test','withdrawn@example.test','connected@example.test','legacy@example.test','legacy-young@example.test','returning@example.test'])await signIn(email);
  // Sign-in is recorded.
  assert.ok(db.prepare('SELECT last_sign_in FROM account_activity WHERE account=?').get(idOf('recent@example.test')).last_sign_in>Date.now()-60_000);

  // The idle account added a passkey once; its own history goes with it.
  const idle=idOf('idle@example.test');
  db.prepare('INSERT INTO passkey_users VALUES(?,?)').run(idle,'handle-for-idle-account');
  db.prepare("INSERT INTO audit(at,actor,action,target) VALUES(?,?,'passkey_added',?)").run(new Date().toISOString(),idle,idle);
  // A withdrawn membership is organisation history: that account stays.
  accounts.revoke(organiser,org,accounts.approve(organiser,org,'withdrawn@example.test'));
  // A website subject must stay stable for anyone who ever connected.
  service.db.prepare("INSERT INTO personas VALUES(?,'example-site','subject-for-test','key','event')").run(idOf('connected@example.test'));

  for(const email of ['operator@example.test','organiser@example.test','idle@example.test','withdrawn@example.test','connected@example.test','returning@example.test'])age(email,YEAR+86_400_000);
  age('legacy@example.test',YEAR+86_400_000,{activity:false});
  age('legacy-young@example.test',300*86_400_000,{activity:false});
  age('recent@example.test',300*86_400_000);
  // Signing in again resets the clock.
  await signIn('returning@example.test');

  service.sweep();
  const remaining=db.prepare('SELECT email FROM accounts ORDER BY email').all().map(r=>r.email);
  assert.deepEqual(remaining,['connected@example.test','legacy-young@example.test','operator@example.test','organiser@example.test','recent@example.test','returning@example.test','withdrawn@example.test']);
  for(const table of ['sessions','account_activity','passkey_users'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE account=?`).get(idle).n,0,table);
  assert.equal(db.prepare('SELECT count(*) n FROM audit WHERE target=?').get(idle).n,0);
  assert.ok(db.prepare("SELECT 1 FROM audit WHERE action='membership_revoked'").get(),'organisation records stay');

  // A removed person can simply sign in again; they get a fresh, empty account.
  const again=await signIn('idle@example.test');
  assert.notEqual(again,idle);assert.equal(accounts.adapter.memberships(again).length,0);
  service.sweep();assert.ok(idOf('idle@example.test'),'a fresh sign-in is not removed');
});
