/** Deterministic replay. Raw log order is transport history, never authority.
 * Creations precede edits; occurrence tombstones follow their grants/assignments.
 * Missing dependencies stay in the log and take effect on the next full reduction.
 * Legacy events have no authenticated clock: bases precede modifiers, with
 * conservative scope conflict resolution. New events supersede legacy registers.
 */
import { eventKey, validateEvent, assertJson } from './event-schema.js';

const creations = new Set(['identity.minted','node.minted']);
const tombstones = new Set(['capability.revoked','role.released','expense.voided']);
const legacyModifiers = new Set(['identity.renamed','node.renamed','node.noted','edge.scoped','tag.removed','claim.withdrawn']);
const stage = e => creations.has(e.t) ? 0 : tombstones.has(e.t) ? 2 : 1;
const scopeRank = e => e.t === 'edge.scoped' ? ({published:0, shared:1, private:2}[e.scope] ?? 2) : 0;
const lexical = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function compareEvents(a, b, keys = null) {
  const tie = () => lexical(keys?.get(a) ?? eventKey(a), keys?.get(b) ?? eventKey(b));
  const phase = stage(a) - stage(b);
  if (phase) return phase;
  const version = (a.v === 2 ? 1 : 0) - (b.v === 2 ? 1 : 0);
  if (version) return version;
  if (a.v === 2) return a.seq - b.seq || tie();
  return Number(legacyModifiers.has(a.t)) - Number(legacyModifiers.has(b.t)) || scopeRank(a) - scopeRank(b) || tie();
}
export function orderedEvents(events) {
  const seen = new Set(), out = [], keys = new Map();
  for (const e of events) {
    if (!e || typeof e !== 'object' || typeof e.t !== 'string') continue;
    // The reducer stays useful for unsigned structural probes, but never consumes
    // a malformed signed representation. Cryptographic verification is the import gate.
    try { if (e.sig) validateEvent(e); else assertJson(e); } catch { continue; }
    let key;
    try { key = eventKey(e); } catch { continue; }
    if (seen.has(key)) continue;
    seen.add(key); keys.set(e,key); out.push(e);
  }
  out.sort((a,b)=>compareEvents(a,b,keys));
  return repliesAfterSources(out);
}

// Iterative traversal keeps long reply chains total; missing references are retained.
export function repliesAfterSources(rows) {
  // Only conversation records participate. A reply naming a grant/revoke id
  // must NEVER be able to move authority events out of their replay phase.
  const conversation = e => e.t == null || ['comment.attached','message.sent'].includes(e.t);
  const byId = new Map(rows.filter(e=>e.id && conversation(e)).map(e=>[e.id,e])), visited = new Set(), result = [];
  for (const start of rows) {
    const pending = []; let cur = start;
    while (cur && !visited.has(cur)) {
      visited.add(cur); pending.push(cur);
      const source = conversation(cur) ? byId.get(cur.replyTo) : null;
      cur = source?.t === cur.t ? source : null;
    }
    while (pending.length) result.push(pending.pop());
  }
  return result;
}
