import Database from 'better-sqlite3';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function fixture(dir){
  mkdirSync(dir,{recursive:true,mode:0o700});
  const path=resolve(dir,'pact.db'),mode=resolve(dir,'release-mode');
  const db=new Database(path);db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT);
    CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT);
    CREATE TABLE IF NOT EXISTS communities(id TEXT PRIMARY KEY,slug TEXT,name TEXT,status TEXT);
    CREATE TABLE IF NOT EXISTS memberships(user_id TEXT,community_id TEXT,display_name TEXT,status TEXT,consented_revision INTEGER);
    CREATE TABLE IF NOT EXISTS protocol_revisions(community_id TEXT,revision INTEGER);`);
  db.exec("DELETE FROM auth_sessions; DELETE FROM memberships; DELETE FROM communities; DELETE FROM protocol_revisions; DELETE FROM users;");
  for(const id of ['robin','sam'])db.prepare('INSERT INTO users VALUES (?,?)').run(id,id+'@example.invalid');
  for(const [id,name] of [['lakeside','Lakeside community'],['private-circle','Private listening circle']]){
    db.prepare('INSERT INTO communities VALUES (?,?,?,?)').run(id,id,name,'active');
    db.prepare('INSERT INTO protocol_revisions VALUES (?,1)').run(id);
    db.prepare('INSERT INTO memberships VALUES (?,?,?,?,1)').run('robin',id,'Robin','active');
  }
  writeFileSync(mode,'alpha\n',{mode:0o600});
  function login(id){
    if(!['robin','sam'].includes(id))throw new Error('Unknown fixture account');
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,new Date(Date.now()+3600_000).toISOString());
    return token;
  }
  return {db,path,mode,login};
}
