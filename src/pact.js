import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function cookie(req,name) {
  const matches=(req.headers.cookie ?? '').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  if(matches.length!==1) return '';
  try { return decodeURIComponent(matches[0].slice(name.length+1)); } catch { return ''; }
}

/** Pilot adapter: reads the existing Pact session and memberships, never writes Pact data. */
export function pactAdapter({path,modeFile}) {
  const db=new Database(path,{readonly:true,fileMustExist:true});
  function open() {
    try { return ['alpha','beta','live'].includes(readFileSync(modeFile,'utf8').trim()); } catch { return false; }
  }
  function account(id) {
    if(!open()) return null;
    // Email is deliberately excluded from the identity-service boundary.
    return db.prepare('SELECT id FROM users WHERE id=?').get(id) ?? null;
  }
  function session(req) {
    if(!open()) return null;
    const token=cookie(req,'pl_session');
    if(!token || token.length>256) return null;
    const hashed=createHash('sha256').update(token).digest('hex');
    return db.prepare('SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hashed,new Date().toISOString()) ?? null;
  }
  function memberships(id) {
    if(!account(id)) return [];
    return db.prepare(`SELECT c.slug, c.name, m.display_name FROM memberships m JOIN communities c ON c.id=m.community_id
      WHERE m.user_id=? AND m.status='active' AND c.status='active'
      AND m.consented_revision=(SELECT MAX(revision) FROM protocol_revisions WHERE community_id=c.id)
      ORDER BY c.name`).all(id);
  }
  return {account,session,memberships,isOpen:open,
    csrfBinding:req=>cookie(req,'pl_session'),
    loginURL:path=>'/?next='+encodeURIComponent(path),
    close:()=>db.close()};
}
