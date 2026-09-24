import Database from 'better-sqlite3';

export function openStore(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc (model TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER, PRIMARY KEY(model,id));
    CREATE INDEX IF NOT EXISTS oidc_grants ON oidc(json_extract(payload,'$.grantId'));
    CREATE TABLE IF NOT EXISTS personas (account TEXT NOT NULL, client TEXT NOT NULL, subject TEXT NOT NULL UNIQUE, private_key TEXT NOT NULL, identity_event TEXT NOT NULL, PRIMARY KEY(account,client));
    CREATE TABLE IF NOT EXISTS connections (account TEXT NOT NULL, client TEXT NOT NULL, name TEXT NOT NULL, memberships TEXT NOT NULL, grant_id TEXT, active INTEGER NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(account,client));
    CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY, account TEXT NOT NULL, client TEXT NOT NULL, event TEXT NOT NULL);
  `);
  return db;
}

export function adapterFor(db) {
  return class SQLiteAdapter {
    constructor(model) { this.model = model; }
    async upsert(id, payload, expiresIn) {
      db.prepare('INSERT OR REPLACE INTO oidc VALUES (?,?,?,?)').run(this.model,id,JSON.stringify(payload),expiresIn ? Math.floor(Date.now()/1000)+expiresIn : null);
    }
    async find(id) {
      const row=db.prepare('SELECT * FROM oidc WHERE model=? AND id=?').get(this.model,id);
      if (!row || (row.expires && row.expires <= Date.now()/1000)) return undefined;
      return JSON.parse(row.payload);
    }
    async findByUid(uid) { return this.by('uid',uid); }
    async findByUserCode(code) { return this.by('userCode',code); }
    async by(field,value) {
      const row=db.prepare(`SELECT id FROM oidc WHERE model=? AND json_extract(payload,'$.${field}')=?`).get(this.model,value);
      return row ? this.find(row.id) : undefined;
    }
    async consume(id) { db.prepare("UPDATE oidc SET payload=json_set(payload,'$.consumed',?) WHERE model=? AND id=?").run(Math.floor(Date.now()/1000),this.model,id); }
    async destroy(id) { db.prepare('DELETE FROM oidc WHERE model=? AND id=?').run(this.model,id); }
    async revokeByGrantId(id) { db.prepare("DELETE FROM oidc WHERE json_extract(payload,'$.grantId')=? OR (model='Grant' AND id=?)").run(id,id); }
  };
}

export function connection(db,account,client) {
  const row=db.prepare('SELECT * FROM connections WHERE account=? AND client=?').get(account,client);
  return row ? {...row,memberships:JSON.parse(row.memberships)} : null;
}

export function disconnect(db,account,client,{keepInteraction=''}={}) {
  db.transaction(()=>{
    const row=connection(db,account,client);
    if (row?.grant_id) db.prepare("DELETE FROM oidc WHERE (json_extract(payload,'$.grantId')=? OR (model='Grant' AND id=?)) AND NOT(model='Interaction' AND id=?)").run(row.grant_id,row.grant_id,keepInteraction);
    db.prepare("DELETE FROM oidc WHERE json_extract(payload,'$.accountId')=? AND json_extract(payload,'$.clientId')=? AND NOT(model='Interaction' AND id=?)").run(account,client,keepInteraction);
    if(keepInteraction)db.prepare("UPDATE oidc SET payload=json_remove(payload,'$.grantId') WHERE model='Interaction' AND id=?").run(keepInteraction);
    db.prepare('UPDATE connections SET active=0, grant_id=NULL, updated=? WHERE account=? AND client=?').run(new Date().toISOString(),account,client);
  })();
}
