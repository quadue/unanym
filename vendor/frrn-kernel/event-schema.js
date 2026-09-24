/** One decoding contract for signatures, event identity, and reduction.
 * v1 bytes remain verifiable; v2 signs the complete, closed event envelope.
 * No caller should reconstruct a signed payload from user content themselves.
 */
import { canon, cidOf, hex } from './core.js';

const optional = (e, keys) => Object.fromEntries(keys.filter(k => e[k] != null).map(k => [k, e[k]]));
const pick = (e, keys) => Object.fromEntries(keys.map(k => [k, e[k]]));
const spec = (author, kind, fields, extra = [], payload = null) => ({ author, kind, fields, extra, payload });
export const EVENT_SCHEMA = {
  'identity.minted': spec('pub', 'identity', ['pub', 'name', 'parent'], [], e => ({ kind:'identity', pub:e.pub, name:e.name ?? null, parent:e.parent ?? null })),
  'identity.renamed': spec('pub', 'identity-rename', ['pub', 'name']),
  'node.minted': spec('owner', 'node', ['cid', 'face', 'name', 'owner'], ['body', 'creation', 'contentCid'], e => ({ kind:'node', cid:e.cid, ...nodeContent(e) })),
  'node.renamed': spec('by', 'node-rename', ['cid', 'name', 'by']),
  'node.noted': spec('by', 'node-note', ['cid', 'by'], ['note', 'enc']),
  'node.marked': spec('by', 'mark', ['cid', 'mark', 'on', 'by'], ['id'], e => ({kind:'mark', cid:e.cid, mark:e.mark, on:e.on !== false, by:e.by})),
  'edge.signed': spec('from', 'edge', ['kind', 'from', 'to', 'scope'], ['id', 'dim', 'audience', 'terms', 'chosen'], e => ({kind:'edge', edge:e.kind, from:e.from, to:e.to, scope:e.scope, ...optional(e, ['dim','audience'])})),
  'edge.scoped': spec('by', 'edge-scope', ['id', 'scope', 'by'], ['audience']),
  'node.linked': spec('by', 'link', ['rel', 'parent', 'child', 'by'], ['id', 'coords']),
  'node.placed': spec('by', 'place', ['child', 'coords', 'by'], ['id']),
  'capability.granted': spec('by', 'capability', ['to', 'scope', 'until', 'by'], ['id']),
  'capability.revoked': spec('by', 'capability-revoke', ['id', 'by']),
  'role.assigned': spec('by', 'role', ['subject', 'role', 'context', 'by'], ['id']),
  'role.released': spec('by', 'role-release', ['id', 'by']),
  'tag.applied': spec('by', 'tag', ['target', 'label', 'by'], ['id', 'audience']),
  'tag.removed': spec('by', 'tag-remove', ['id', 'by']),
  'claim.challenged': spec('by', 'challenge', ['target', 'by'], ['id', 'reason', 'dim', 'evidence']),
  'claim.withdrawn': spec('by', 'challenge-withdraw', ['id', 'by']),
  'expense.logged': spec('by', 'expense', ['context', 'amount', 'currency', 'what', 'split', 'by', 'ts', 'nonce'], ['id']),
  'expense.voided': spec('by', 'expense-void', ['id', 'by']),
  'settlement.logged': spec('by', 'settlement', ['context', 'to', 'amount', 'currency', 'what', 'by', 'ts', 'nonce'], ['id']),
  'comment.attached': spec('by', 'comment', ['target', 'body', 'by', 'ts', 'nonce'], ['id', 'replyTo']),
  'message.sent': spec('by', 'message', ['to', 'body', 'by', 'ts', 'nonce'], ['id', 'replyTo']),
};

const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
export function assertJson(value, depth = 0) {
  if (depth > 64) throw new TypeError('event nesting too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError('event must contain plain JSON');
  for (const key of Object.keys(value)) {
    if (unsafe.has(key)) throw new TypeError('reserved JSON key');
    assertJson(value[key], depth + 1);
  }
}

// Even legacy flattened bodies cannot shadow their signed envelope.
const reservedBody = new Set(['t','v','sig','ts','seq','nonce','id','cid','face','name','owner','kind','creation','contentCid','by','from','pub']);
export function validateNodeBody(body) {
  if (body == null) return;
  assertJson(body);
  if (Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => reservedBody.has(k))) throw new TypeError('reserved node body field');
}
export function nodeContent(e) {
  validateNodeBody(e.body);
  return e.v === 2
    ? { face:e.face, name:e.name, owner:e.owner, body:e.body ?? {} }
    : { face:e.face, name:e.name, owner:e.owner, ...(e.body ?? {}) };
}
export function nodeIdentity(e) {
  return e.v === 2 ? { kind:'object', v:2, owner:e.owner, creation:e.creation, contentCid:e.contentCid } : nodeContent(e);
}

export function relationId(e) {
  switch (e.t) {
    case 'edge.signed': return `${e.kind}:${e.from}->${e.to}${e.dim ? ':'+e.dim : ''}`;
    case 'node.linked': return `${e.rel}:${e.v === 2 ? e.by+':' : ''}${e.parent}->${e.child}`;
    case 'node.placed': return `placed:${e.by}->${e.child}${e.coords?.namespace ? ':'+e.coords.namespace : ''}`;
    case 'capability.granted': return `cap:${e.by}->${e.to}@${e.scope?.target ?? ''}:${e.scope?.can ?? ''}`;
    case 'role.assigned': return `role:${e.by}->${e.subject}:${e.role}@${e.context ?? ''}`;
    case 'node.marked': return `mark:${e.by}->${e.cid}:${e.mark}`;
    case 'tag.applied': return `tag:${e.by}->${e.target}:${e.label.toLowerCase()}`;
    case 'claim.challenged': return `chal:${e.by}->${e.target}${e.dim ? ':'+e.dim : ''}`;
    case 'expense.logged': return `exp:${e.by.slice(0,8)}:${e.ts}:${e.nonce}`;
    case 'settlement.logged': return `stl:${e.by.slice(0,8)}:${e.ts}:${e.nonce}`;
    case 'comment.attached': return `cmt:${e.by.slice(0,8)}:${e.ts}:${e.nonce}`;
    case 'message.sent': return `msg:${e.by.slice(0,8)}:${e.ts}:${e.nonce}`;
    default: return null;
  }
}
const occurrences = new Set(['capability.granted','role.assigned']);
export function eventAuthor(e) { return EVENT_SCHEMA[e?.t] ? e[EVENT_SCHEMA[e.t].author] ?? null : null; }

export function validateEvent(e) {
  assertJson(e);
  const s = EVENT_SCHEMA[e.t];
  if (!s) throw new TypeError('unknown event type');
  if (e.v != null && e.v !== 2) throw new TypeError('unknown event version');
  const allowed = new Set(['t','sig','ts', ...s.fields, ...s.extra, ...(e.v === 2 ? ['v','nonce','seq'] : [])]);
  if (Object.keys(e).some(k => !allowed.has(k))) throw new TypeError('unknown envelope field');
  const str = k => { if (typeof e[k] !== 'string' || !e[k]) throw new TypeError(`invalid ${k}`); };
  str(s.author);
  for (const k of ['id','cid','face','pub','by','owner','from','to','child','target','mark','role','subject','rel','dim','replyTo','nonce']) if (k in e && e[k] != null) str(k);
  for (const k of ['name','label','note','what','currency','reason']) if (k in e && e[k] != null && typeof e[k] !== 'string') throw new TypeError(`invalid ${k}`);
  for (const k of s.fields) if (!(k in e) && !['name','parent','until','context'].includes(k)) throw new TypeError(`missing ${k}`);
  if ('ts' in e && (!Number.isSafeInteger(e.ts) || e.ts < 0)) throw new TypeError('invalid timestamp');
  if ('on' in e && typeof e.on !== 'boolean') throw new TypeError('invalid mark');
  if ('amount' in e && (typeof e.amount !== 'number' || !(e.amount > 0))) throw new TypeError('invalid amount');
  for (const k of ['audience','split']) if (k in e && (!Array.isArray(e[k]) || e[k].some(p => typeof p !== 'string' || !p))) throw new TypeError(`invalid ${k}`);
  if (e.t.startsWith('edge.')) {
    if (!['private','shared','published'].includes(e.scope)) throw new TypeError('invalid edge scope');
    if (e.t === 'edge.signed' && !['adopt','attest','trust'].includes(e.kind)) throw new TypeError('invalid edge kind');
    if (e.v !== 2 && (e.kind === 'trust' || e.terms != null || e.chosen != null)) throw new TypeError('new edge intent needs v2');
    if (e.kind === 'trust' && typeof e.chosen !== 'boolean') throw new TypeError('explicit trust choice required');
    if (e.chosen != null && e.kind !== 'trust') throw new TypeError('choice belongs to trust');
  }
  if (e.terms != null) {
    const terms=e.terms, snapshot=terms.snapshot;
    if (e.t !== 'edge.signed' || e.v !== 2 || e.kind !== 'attest' || !['assent','receipt'].includes(e.dim)
      || typeof terms.version !== 'string' || Object.keys(terms).some(k=>!['version','snapshot'].includes(k))
      || !snapshot || snapshot.object !== e.to || typeof snapshot.name !== 'string'
      || Object.keys(snapshot).sort().join(',') !== 'body,name,note,object,parties'
      || !Array.isArray(snapshot.parties) || !snapshot.parties.includes(e.from)
      || snapshot.parties.some(p=>typeof p !== 'string' || !p)
      || JSON.stringify(snapshot.parties) !== JSON.stringify([...new Set(snapshot.parties)].sort())) throw new TypeError('invalid exact terms');
  }
  if (e.t === 'capability.granted') {
    if (!e.scope || typeof e.scope.target !== 'string' || typeof e.scope.can !== 'string' || Object.keys(e.scope).some(k => !['target','can'].includes(k))) throw new TypeError('invalid capability scope');
    if (e.until != null && (!Number.isSafeInteger(e.until) || e.until < 0)) throw new TypeError('invalid expiry');
  }
  if (e.t === 'node.noted' && ((e.note != null) === (e.enc != null))) throw new TypeError('exactly one note representation required');
  if (['comment.attached','message.sent'].includes(e.t) && typeof e.body !== 'string') throw new TypeError('invalid message body');
  if (e.t === 'node.minted') {
    validateNodeBody(e.body);
    if (e.v === 2 && (!/^[0-9a-f]{32}$/.test(e.creation) || typeof e.contentCid !== 'string')) throw new TypeError('invalid creation identity');
    if (e.v !== 2 && ('creation' in e || 'contentCid' in e)) throw new TypeError('legacy creation fields');
  }
  if (e.v === 2 && (!/^[0-9a-f]{32}$/.test(e.nonce) || !Number.isSafeInteger(e.seq) || e.seq < 1 || !Number.isSafeInteger(e.ts))) throw new TypeError('invalid authenticated occurrence');
  const id = relationId(e);
  const expected = e.v === 2 && occurrences.has(e.t) ? `${id}#${e.nonce}` : id;
  if (expected != null && e.id !== expected) throw new TypeError('invalid derived reference id');
  return e;
}

export function signedPayload(e) {
  const s = EVENT_SCHEMA[e.t];
  if (!s) throw new TypeError('unknown event type');
  if (e.v === 2) { const {sig, ...envelope} = e; return {domain:'frrn:event', ...envelope}; }
  if (s.payload) return s.payload(e);
  const p = {kind:s.kind, ...pick(e,s.fields), ...optional(e,s.extra.filter(k => k !== 'id'))};
  if (e.t === 'capability.granted') p.until ??= null;
  if (e.t === 'role.assigned') p.context ??= null;
  return p;
}

const clocks = new Map();
export function observeEvents(events) {
  for (const e of events) if (e?.v === 2 && Number.isSafeInteger(e.seq)) {
    const author = eventAuthor(e);
    clocks.set(author, Math.max(clocks.get(author) ?? 0, e.seq));
  }
}
export const newNonce = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export async function signEvent(signer, event) {
  let e = structuredClone(event);
  if (signer.eventTime != null) {
    e.ts = signer.eventTime;
    if (relationId(e) != null) e.id = relationId(e);
  }
  if (signer.eventVersion !== 1) {
    const seq = Math.max(Date.now(), (clocks.get(signer.pub) ?? 0) + 1);
    clocks.set(signer.pub, seq);
    e = {...e, v:2, nonce: e.nonce ?? newNonce(), seq};
    if (e.t === 'node.linked') e.id = relationId(e);
    if (occurrences.has(e.t)) e.id = `${relationId(e)}#${e.nonce}`;
  }
  validateEvent(e);
  const sig = await signer.sign(signedPayload(e));
  if (signer.eventVersion === 1) {
    // Preserve the serialized legacy fixture representation as well as its
    // authenticated content. Historical constructors placed sig before ts.
    const keys = e.t === 'node.minted'
      ? ['t','cid','face','name','owner',...(e.body ? ['body'] : []),'ts']
      : Object.keys(e);
    return Object.fromEntries(keys.flatMap(k=>k === 'ts' ? [['sig',sig],[k,e[k]]] : [[k,e[k]]]));
  }
  return {...e, sig};
}

/** Hypothetical v2 grant for previews only. No signature and no clock mutation. */
export function previewCapability(log, by, to, scope, until = null) {
  const nonce = newNonce();
  const seq = log.reduce((n,e)=>e.v === 2 && eventAuthor(e) === by ? Math.max(n,e.seq) : n,Date.now()) + 1;
  const e = {t:'capability.granted',v:2,by,to,scope,until,ts:Date.now(),seq,nonce};
  e.id = `${relationId(e)}#${nonce}`;
  return validateEvent(e);
}

const decode = new TextDecoder();
export function eventKey(e) {
  // Legacy identity excludes all unsigned metadata, including the signature.
  // Intentional repetition is distinguishable only in authenticated v2 occurrences.
  try { return decode.decode(canon({author:eventAuthor(e), t:e.t, payload:signedPayload(e)})); }
  catch { return decode.decode(canon(e)); }
}

export async function verifyEvent(e, verify) {
  try {
    validateEvent(e);
    if (typeof e.sig !== 'string' || !e.sig) return false;
    if (e.t === 'node.minted') {
      if (e.cid !== await cidOf(nodeIdentity(e))) return false;
      if (e.v === 2 && e.contentCid !== await cidOf(nodeContent(e))) return false;
    }
    if (e.terms && e.terms.version !== await cidOf(e.terms.snapshot)) return false;
    return !!await verify(eventAuthor(e), e.sig, signedPayload(e));
  } catch { return false; }
}
