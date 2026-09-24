/**
 * events.js — the protocol. Event-type contracts + the total reducer.
 * Isomorphic: constructors take a `signer` ({ pub, name?, async sign(payload) })
 * so the same kernel runs on Node (node:crypto) or in the browser (Web Crypto).
 *
 * Invariant 1: the event log IS the protocol; state is a reduction.
 * Invariant 2: append-only — a scope change is `edge.scoped`, never an edit.
 * Invariant 3: signed contracts are explicit — v2 envelopes never reinterpret v1 bytes.
 * Invariant 4: the reducer is total — unknown types ignored, malformed skipped.
 */
import { cidOf } from './core.js';
import { signEvent, verifyEvent, validateNodeBody, nodeContent, nodeIdentity, newNonce } from './event-schema.js';
import { orderedEvents, repliesAfterSources } from './event-order.js';
import { settleContainment } from './access.js';
import { termsVersion } from './assent.js';

// The canonical list: every type the reducer handles, and nothing it doesn't.
// `tests/event-coverage.test.js` reflects over the reducer source and fails if this drifts.
export const EVENT_TYPES = ['identity.minted', 'identity.renamed', 'node.minted', 'node.renamed', 'node.noted', 'node.marked', 'edge.signed', 'edge.scoped', 'node.linked', 'node.placed', 'capability.granted', 'capability.revoked', 'role.assigned', 'role.released', 'tag.applied', 'tag.removed', 'claim.challenged', 'claim.withdrawn', 'expense.logged', 'expense.voided', 'settlement.logged', 'comment.attached', 'message.sent'];

/**
 * Can an event type ride in a packet at all (`SHARED_EVENT_TYPES`), or is it purely local
 * machinery that never travels (`LOCAL_EVENT_TYPES`)? Their union MUST equal `EVENT_TYPES` —
 * the coverage test fails otherwise, so a NEW event type cannot be added without a deliberate
 * decision here. Every shared type must also be author-resolvable (`eventAuthor`) and verifiable
 * (`verifyEvents`) or it dies silently at the merge gate — the coverage test enforces that too.
 * This kills the denylist-by-omission class that left `role.assigned` un-propagated (invites
 * never synced) until slice 1.
 *
 * NOTE: this is a *can-it-travel* gate, not *who-sees-it*. WHO a given event reaches is decided
 * per-viewer by `src/packet.js` (`packetFor`/`publicPacket`) — the audience-aware floor in
 * docs/membrane.md. `capability.*` is shared HERE (it's the disclosure control-plane: a grant
 * must reach its grantee, a revoke must reach them to hide access on next fetch) but `packetFor`
 * only ever ships a grant/revoke to the pubkey it addresses. The two had to land together: with
 * a naive author-only packet, sharing grants would broadcast every grant to everyone.
 */
export const SHARED_EVENT_TYPES = [
  'identity.minted', 'identity.renamed',                        // who you are
  'node.minted', 'node.renamed', 'node.noted', 'node.marked',   // your things + their state
  'edge.signed', 'edge.scoped',                                 // vouch / adopt and re-scope
  'node.linked', 'node.placed',                                 // structure / placement
  'capability.granted', 'capability.revoked',                  // disclosure control-plane (addressed by packetFor)
  'role.assigned', 'role.released',                             // who's-on-what / membership + the way out
  'tag.applied', 'tag.removed',                                 // discovery labels
  'claim.challenged', 'claim.withdrawn',                        // disputes
  'expense.logged', 'expense.voided', 'settlement.logged',    // shared-cost claims + their void + payments (the ledger)
  'comment.attached',                                          // discussion/rationale attached to a thing
  'message.sent',                                              // the dyad "say": a directed message to a person (packetFor addresses it to the two participants only)
];
// Purely local machinery that never travels in any packet. Empty today: every event type can
// reach SOMEONE, and packetFor decides exactly whom. (Kept as the forcing-function's other half.)
export const LOCAL_EVENT_TYPES = [];

/* ---- event constructors (async: signing may be async in the browser) ---- */

// parent = the master identity's pubkey for a child (HD master→child→session); null for a root.
export async function mintIdentity(signer, parent = null) {
  const name = signer.name ?? null;
  const p = parent ?? null;

  return signEvent(signer, { t: 'identity.minted', pub: signer.pub, name, parent: p, ts: Date.now() });
}

/** mint a node owned by `signer`. One primitive: face ∈ person|object|group|… */
export async function mintNode(signer, { face, name, body = {} }) {
  validateNodeBody(body);
  const e = { t:'node.minted', face, name, owner:signer.pub, ...(Object.keys(body).length ? {body:structuredClone(body)} : {}), ts:Date.now() };
  if (signer.eventVersion !== 1) {
    e.v = 2;
    e.creation = newNonce();
    e.contentCid = await cidOf(nodeContent(e));
  }
  e.cid = await cidOf(nodeIdentity(e));
  return signEvent(signer, e);
}

/** sign an edge from `signer` to a node cid. kind ∈ adopt|attest.
 *  scope ∈ private|shared|published. If scope==='shared', pass `audience`
 *  (a non-empty pubkey list) so the edge is visible only to author + audience.
 *  `audience` is part of the signed payload — changing it after signing
 *  breaks verification. */
export async function signEdge(signer, kind, toCid, scope = 'published', dim = null, audience = null, terms = null, chosen = true) {
  // dim (D3): optional dimension an attest is *about* ("trusted for cooking, not generically").
  // Signed when present, omitted bytes-identically when absent. A dimensioned edge gets a
  // distinct id so it can coexist with a general one from the same signer.
  // audience (graduated-scope): optional list of pubkeys that may also see a 'shared' edge.
  // Signed when present (and non-empty), omitted bytes-identically when absent, so old events
  // while legacy event bytes retain their original signature contract.

  // Full signer pubkey in the id (not an 8-char prefix): a 32-bit prefix is
  // grindable, and a colliding id would clobber another signer's edge in the
  // reduced state (the reducer keys by id, last-write-wins). Full key ⇒ no collision.
  const id = `${kind}:${signer.pub}->${toCid}${dim ? ':' + dim : ''}`;
  const ev = { t: 'edge.signed', id, kind, from: signer.pub, to: toCid, scope, ts: Date.now() };
  if (dim) ev.dim = dim;
  if (Array.isArray(audience) && audience.length) ev.audience = audience;
  if (terms != null) ev.terms = terms;
  if (kind === 'trust') ev.chosen = chosen;
  return signEvent(signer, ev);
}

/** Deliberate assent binds the exact displayed snapshot AND the complete party set. */
export async function signAssent(signer, node, parties, scope = 'published', audience = null, intent = 'assent') {
  if (!['assent','receipt'].includes(intent)) throw new TypeError('explicit assent or receipt required');
  if (!parties.includes(signer.pub)) throw new TypeError('only a named party can assent');
  return signEdge(signer, 'attest', node.cid, scope, intent, audience, await termsVersion(node, parties));
}

/** Explicit choice to consult this node owner's judgment in this context. */
export async function chooseTrust(signer, ownerNodeCid, context = null, scope = 'private', audience = null) {
  return signEdge(signer, 'trust', ownerNodeCid, scope, context, audience);
}

export async function withdrawTrust(signer, ownerNodeCid, context = null, scope = 'private', audience = null) {
  return signEdge(signer, 'trust', ownerNodeCid, scope, context, audience, null, false);
}

/** re-scope an existing edge. Only the original signer may change scope.
 *  Pass `audience` to set a graduated-scope audience — the audience becomes
 *  part of the new signed payload. Pass `null` (default) to clear audience
 *  (the edge becomes private or published based on `scope` alone).
 *  async: signing matches the rest of the constructor API. */
export async function scopeEdge(signer, edgeId, scope, audience = null) {
  // The signed payload includes audience when set, mirroring signEdge's contract.
  // To clear a previously-set audience, callers pass audience=null explicitly;
  // the omission keeps the historical 'edge-scope' contract.

  const ev = { t: 'edge.scoped', id: edgeId, scope, by: signer.pub, ts: Date.now() };
  if (Array.isArray(audience) && audience.length) ev.audience = audience;
  return signEvent(signer, ev);
}

/** link one node as an element of another (a node can hold element-nodes).
 *  rel ∈ contains | triggers | needs. Signed by `signer` (an owner of parent). */
export async function linkNodes(signer, parentCid, childCid, rel = 'contains', coords = null) {
  // coords (D2): optional { namespace?, dims?:{[dim]:string|number} } — a coordinate-
  // bearing placement claim. Signed when present; omitted bytes-identically when absent,
  // so links from before D2 keep their signatures (invariant 4).

  const id = `${rel}:${parentCid}->${childCid}`;
  const ev = { t: 'node.linked', id, parent: parentCid, child: childCid, rel, by: signer.pub, ts: Date.now() };
  if (coords) ev.coords = coords;
  return signEvent(signer, ev);
}

/** place a node at a pure semantic coordinate — no container (D2b).
 *  "this CID sits at coordinate C, from `signer`'s seat." A new event type, not a
 *  bent node.linked. id is per (signer, child, namespace): re-placing within a
 *  namespace overwrites (move it); placing in another namespace coexists (two addresses). */
export async function placeNode(signer, childCid, coords) {

  const ns = coords?.namespace ? ':' + coords.namespace : '';
  const id = `placed:${signer.pub}->${childCid}${ns}`;
  return signEvent(signer, { t: 'node.placed', id, child: childCid, coords, by: signer.pub, ts: Date.now() });
}

/** grant a capability (D9): `signer` lets `toPub` do `scope.can` over `scope.target`
 *  until `until` (ms epoch, or null = no expiry). Revocable by the grantor. Expiry is
 *  resolved at read time by `canAccess`, never in the (clock-free) reducer. */
export async function grantCapability(signer, toPub, scope, until = null) {
  const u = until ?? null;

  const id = `cap:${signer.pub}->${toPub}@${scope?.target ?? ''}:${scope?.can ?? ''}`;
  return signEvent(signer, { t: 'capability.granted', id, by: signer.pub, to: toPub, scope, until: u, ts: Date.now() });
}
/** revoke a capability. Only the original grantor may revoke (enforced in `reduce`). */
export async function revokeCapability(signer, capId) {

  return signEvent(signer, { t: 'capability.revoked', id: capId, by: signer.pub, ts: Date.now() });
}

/** assign a role (D10): `signer` claims that `subject` (a pubkey or node cid) holds
 *  `role` in `context` (a node cid, or null = global). A signed, context-scoped,
 *  perspective-relative claim — NOT a property of the person and NOT a scalar. */
export async function assignRole(signer, subject, role, context = null) {
  const ctx = context ?? null;

  const id = `role:${signer.pub}->${subject}:${role}@${ctx ?? ''}`;
  return signEvent(signer, { t: 'role.assigned', id, subject, role, context: ctx, by: signer.pub, ts: Date.now() });
}

/** release a role (the way OUT of `role.assigned` — §4.2 A3: "the other person can't
 *  un-assign himself"). References the assignment's id. Two hands may open it (enforced
 *  in `reduce`): the ASSIGNER withdraws their own claim, or the SUBJECT steps back — a
 *  role is a claim about a person, and the person named always keeps the exit. Anyone
 *  else's release is an inert claim. Append-only: the log keeps assignment + release;
 *  the reduced state drops that occurrence; a fresh assignment has a new id. */
export async function releaseRole(signer, roleId) {

  return signEvent(signer, { t: 'role.released', id: roleId, by: signer.pub, ts: Date.now() });
}

/** rename an identity (self-rename). Append-only: the old `identity.minted` stays
 *  in the log; the reducer overwrites the derived state's name. Signed by the
 *  identity's own key — only you can rename yourself. A rename event rides in
 *  your public packet (see web/shell.html myContactPacket) so it propagates on
 *  re-share. New event type (invariant 3: new meaning = new `t`), additive (old
 *  code that doesn't know `identity.renamed` ignores it — invariant 4). */
export async function renameIdentity(signer, name) {

  return signEvent(signer, { t: 'identity.renamed', pub: signer.pub, name, ts: Date.now() });
}

/** rename a node you own. Append-only: the old `node.minted` stays; the reducer
 *  overwrites the derived state's name. Signed by the node's owner (`by`) — only
 *  the owner can rename their own thing. You cannot rename someone else's node
 *  (you don't have their key). New event type, additive. */
export async function renameNode(signer, cid, name) {

  return signEvent(signer, { t: 'node.renamed', cid, name, by: signer.pub, ts: Date.now() });
}

/** set/replace a node's freeform note (its body text) — content, NOT identity, so it is
 *  NOT part of the CID (mirrors rename: editing the note never changes what the node IS).
 *  Field is `note`, distinct from node.minted's `body` (the CID-bearing extra-fields object).
 *  Append-only: the old node.noted stays; the reducer keeps the latest. Signed by the
 *  owner (`by`) — only the owner can note their own thing. New event type, additive
 *  (invariants 3,4). Rides in the owner's packet so the note propagates on re-share. */
export async function noteNode(signer, cid, note, { seal = null } = {}) {
  const text = String(note ?? '');
  // `seal` is an injected sealer (the M5 seam — like `signer`, the kernel imports no crypto):
  // when present, a directed note travels as an opaque `enc` body the audience alone can open,
  // and the plaintext NEVER enters the event. Absent → the public plaintext path, unchanged.
  if (seal) {
    const enc = await seal(text);

    return signEvent(signer, { t: 'node.noted', cid, enc, by: signer.pub, ts: Date.now() });
  }

  return signEvent(signer, { t: 'node.noted', cid, note: text, by: signer.pub, ts: Date.now() });
}

/** mark a node with a named state (e.g. 'done') — a signed, append-only status claim.
 *  Latest event per (signer, cid, mark) wins; toggling off is a superseding {on:false},
 *  so un-ticking is itself a signed event, never a deletion (invariant 2). ANYONE may
 *  mark — the assignee, the owner, a helper — and WHO marked is part of the truth (the
 *  UI surfaces "Tom marked done"). A coordination fact, not perspective-weighted like
 *  credence. New type, additive (invariants 3,4). Rides in the marker's packet.
 *  WRITE is open; the FACT is gated: whose mark flips done-state is decided at read time
 *  by `markEntitled`/`entitledMarksOn` (src/credence.js) — owner, or owner-assigned via a
 *  role on the node. A stranger's mark stays visible provenance, never the fact. */
export async function markNode(signer, cid, mark = 'done', on = true) {
  const m = String(mark).slice(0, 40);
  const flag = on !== false;

  const id = `mark:${signer.pub}->${cid}:${m}`;
  return signEvent(signer, { t: 'node.marked', id, cid, mark: m, on: flag, by: signer.pub, ts: Date.now() });
}

/** challenge (dispute) a CLAIM — `target` is a claim id: an `edge.signed` id, a `tag.*`
 *  id, or a node cid (and, later, a recovery-proposal id). The negative dual of attest:
 *  the kernel was all-positive (you could vouch but not dispute), so credence and tags
 *  were uncontestable under adversarial use. A challenge is **about a claim, never a
 *  person** (no scalar person-score — Nosedive) and, like `tag.*`, deliberately does NOT
 *  feed the knows-graph, so disputing can't itself move trust distance. Perspective-
 *  relativity is applied at READ time (`challengesFrom` in credence.js, trust-weighted),
 *  so this never mutates the credence scalar. Signed + attributable (a challenge can
 *  itself be challenged). `reason`/`evidence` are optional context; `dim` lets a dispute
 *  be scoped to a dimension. id is per (challenger, target, dim) → one challenge per claim,
 *  idempotent. New meaning → new type (invariant 3); additive (4).
 *  A challenge is ANSWERABLE: the challenged party (or anyone) responds by attaching a
 *  comment to the challenge's own id — `attachComment(signer, ev.id, …)`. No new event
 *  type; the answer travels with the disputed thing (src/packet.js) and surfaces via
 *  `challengesFrom(...).answeredBy` / `commentsOn(state, ev.id)`. An answer, like the
 *  challenge, moves no scalar — only `claim.withdrawn` (challenger-only) clears it. */
export async function challengeClaim(signer, target, { reason = null, dim = null, evidence = null } = {}) {
  const r = reason != null ? String(reason).slice(0, 280) : null;

  const id = `chal:${signer.pub}->${target}${dim ? ':' + dim : ''}`;
  const ev = { t: 'claim.challenged', id, by: signer.pub, target, ts: Date.now() };
  if (r != null) ev.reason = r;
  if (dim) ev.dim = dim;
  if (evidence) ev.evidence = evidence;
  return signEvent(signer, ev);
}

/** withdraw a challenge YOU raised. Append-only: a superseding event, never a deletion —
 *  the log keeps both; the reducer yields absence. Only the original challenger may withdraw. */
export async function withdrawChallenge(signer, target, dim = null) {
  const id = `chal:${signer.pub}->${target}${dim ? ':' + dim : ''}`;

  return signEvent(signer, { t: 'claim.withdrawn', id, by: signer.pub, ts: Date.now() });
}

/** apply a free-text tag (a label) to a `target` — a node cid OR an identity pub.
 *  The loosest attestation: schemaless, anyone-can-say, for discovery — the common
 *  ancestor a credential is (same primitive, more dials turned up: schema, issuer
 *  scope, holder audience). Signed by `signer`, so it's verifiable and trust-routable
 *  like any event; but it is deliberately NOT a trust edge — `tag.*` never feeds the
 *  knows-graph (src/credence.js), so labelling someone's thing can't inflate credence.
 *  New meaning → new type (invariant 3). `audience` mirrors edge.signed's graduated
 *  scope (omitted bytes-identically when absent), so a tag can later be scoped toward
 *  a held credential without a contract break. The id is per (tagger, target, label),
 *  so re-tagging the same word is idempotent and a tagger holds one tag per label. */
export async function applyTag(signer, target, label, audience = null) {
  const lab = String(label).trim().slice(0, 60);
  const norm = lab.toLowerCase();

  const id = `tag:${signer.pub}->${target}:${norm}`;
  const ev = { t: 'tag.applied', id, by: signer.pub, target, label: lab, ts: Date.now() };
  if (Array.isArray(audience) && audience.length) ev.audience = audience;
  return signEvent(signer, ev);
}

/** remove a tag YOU applied. Append-only: a superseding event, never a deletion —
 *  the log keeps both `tag.applied` and `tag.removed`; the reducer yields absence.
 *  Only the original tagger may remove their own tag (enforced in `reduce`). */
export async function removeTag(signer, target, label) {
  const norm = String(label).trim().slice(0, 60).toLowerCase();
  const id = `tag:${signer.pub}->${target}:${norm}`;

  return signEvent(signer, { t: 'tag.removed', id, by: signer.pub, ts: Date.now() });
}

/* ---- shared expenses (the ledger) ---- */
/** Log a shared cost: "I (signer) paid `amount` `currency` for `what`, split equally among
 *  `split` (pubkeys), within `context` (a space cid)." A signed CLAIM, append-only.
 *  ACCOUNTING, not credence and NOT an ownership transfer: the real money moved on an external
 *  rail; the kernel records the claim and `src/ledger.js` derives who-owes-whom. It is never
 *  trust-weighted and never a conserved/custodial balance — the deferred transfer/custody
 *  primitive stays separate (CLAUDE.md: ownership-move vs custody-hold vs balance must not fuse). */
// a random nonce, carried INSIDE the signed payload. Ed25519 is deterministic, so without it two
// byte-identical expenses (same payer/amount/what/split) would sign to the same id and silently
// collapse; with it they stay distinct, while a relayed copy of the SAME signed event still dedups.
const expenseNonce = newNonce;

export async function logExpense(signer, context, { amount, currency = 'EUR', what = '', split = [] } = {}) {
  const by = signer.pub;
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0)) throw new Error('logExpense: amount must be a positive number');  // expense ≡ positive cost; credits/voids are a separate, deliberate event
  const cur = String(currency || 'EUR').toUpperCase().slice(0, 6);
  const desc = String(what || '').slice(0, 120);
  const who = Array.isArray(split) ? [...new Set(split.map(String))] : [];
  const ts = Date.now();
  const nonce = expenseNonce();

  const id = `exp:${by.slice(0, 8)}:${ts}:${nonce}`;
  return signEvent(signer, { t: 'expense.logged', id, by, context, amount: amt, currency: cur, what: desc, split: who, ts, nonce });
}

/** Record a PAYMENT (settle-up): `signer` claims they paid `to` `amount` in `context`, on an
 *  external rail — the ledger's other half. A distinct type from expense.logged on purpose
 *  (invariant 3, new meaning = new t): a shared COST creates debts; a PAYMENT discharges
 *  them. Same accounting plane (a signed claim, never custody) — src/ledger.js folds it into
 *  balances() under the same off-currency guard. Correcting a mistaken payment = the
 *  recipient logs one back (append-only honesty); expense.voided covers costs only. */
export async function logSettlement(signer, context, { to, amount, currency = 'EUR', what = '' } = {}) {
  const by = signer.pub;
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0)) throw new Error('logSettlement: amount must be a positive number');
  if (!to) throw new Error('logSettlement: a recipient is required');
  const cur = String(currency || 'EUR').toUpperCase().slice(0, 6);
  const desc = String(what || '').slice(0, 120);
  const ts = Date.now();
  const nonce = expenseNonce();

  const id = `stl:${by.slice(0, 8)}:${ts}:${nonce}`;
  return signEvent(signer, { t: 'settlement.logged', id, by, context, to: String(to), amount: amt, currency: cur, what: desc, ts, nonce });
}

/** Void a mistaken expense — only its original logger may (enforced in `reduce`). Append-only:
 *  the row stays in the log (renders struck-through, provenance kept); it just stops counting —
 *  and a voided FIRST expense releases the context's currency lock to the next live one. */
export async function voidExpense(signer, expenseId) {

  return signEvent(signer, { t: 'expense.voided', id: expenseId, by: signer.pub, ts: Date.now() });
}

/* ---- discussion (attach) ---- */
/** Attach a comment to an EXISTING thing — discussion/rationale that persists and travels
 *  WITH the thing (membrane-scoped via packetFor on the target's visibility). Append-only and
 *  attributable; comments accumulate (no latest-wins). It is NOT the node's body (that's
 *  node.noted) and NOT a trust edge — it carries the *why*, never moves credence. A nonce keeps
 *  two identical comments distinct while a relayed copy of the same signed event still dedups.
 *  `replyTo`, when present, is a signed reference to the source event. It changes no trust or
 *  visibility semantics; it only lets renderers preserve conversational provenance. */
export async function attachComment(signer, target, body, { replyTo = null } = {}) {
  const by = signer.pub;
  const text = String(body ?? '').slice(0, 1000);
  const ts = Date.now();
  const nonce = expenseNonce();

  const ref = replyTo == null ? null : String(replyTo);

  const id = `cmt:${by.slice(0, 8)}:${ts}:${nonce}`;
  return signEvent(signer, { t: 'comment.attached', id, by, target, body: text, ...(ref ? { replyTo: ref } : {}), ts, nonce });
}

/* ---- directed message (the dyad "say") ---- */
/** Send a message to a PERSON (pubkey `to`), not attached to a thing — the missing middle rung
 *  (you-chat ↔ person ↔ room). Append-only and attributable; messages accumulate (no latest-wins),
 *  exactly like a comment but addressed to a pubkey instead of a cid. The body is PLAINTEXT at rest:
 *  a directed message never rides the public lane (packetFor addresses it to the two participants
 *  only, so it is excluded from publicPacket and never reaches the homeserver), and on the wire it
 *  is sealed by the directed courier (`dmSeal` → sealJSON1). Its only at-rest copies are the two
 *  participants' own local logs — where each must be able to re-read it — so there is no `enc` here
 *  (that is node.noted's need, because a note travels the public lane WITH its thing; a message does
 *  not). Render-only: it carries no credence and never feeds the knows-graph until it is crystallized
 *  into a thing. A nonce keeps two identical messages distinct while a relayed copy still dedups.
 *  `replyTo`, when present, is a signed reference to the source event. It is render provenance,
 *  not an edge: replying still creates no trust path and stays inside the same directed lane. */
export async function sendMessage(signer, to, body, { replyTo = null } = {}) {
  const by = signer.pub;
  const text = String(body ?? '').slice(0, 1000);
  const ts = Date.now();
  const nonce = expenseNonce();

  const ref = replyTo == null ? null : String(replyTo);

  const id = `msg:${by.slice(0, 8)}:${ts}:${nonce}`;
  return signEvent(signer, { t: 'message.sent', id, by, to, body: text, ...(ref ? { replyTo: ref } : {}), ts, nonce });
}

/* ---- the total reducer ---- */

export function reduce(events) {
  const s = { identities: {}, nodes: {}, edges: {}, links: {}, placements: {}, capabilities: {}, roles: {}, tags: {}, challenges: {}, marks: {}, expenses: {}, settlements: {}, comments: {}, messages: {} };
  const grants = new Map(), assignments = new Map();
  for (const raw of orderedEvents(events)) {
    const e = structuredClone(raw); // derived state cannot mutate signed log bytes
    if (!e || typeof e.t !== 'string') continue;                     // malformed → skip
    switch (e.t) {
      case 'identity.minted':
        if (e.pub) s.identities[e.pub] = { pub: e.pub, name: e.name ?? null, parent: e.parent ?? null, sig: e.sig ?? null, ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'node.minted':
        if (e.cid && e.owner && !s.nodes[e.cid]) s.nodes[e.cid] = { cid: e.cid, face: e.face, name: e.name, owner: e.owner, sig: e.sig, ...(e.body ? { body: e.body } : {}), creationName:e.name, creationBody:e.body ?? {}, contentCid:e.contentCid ?? e.cid };
        break;
      case 'edge.signed':
        if (e.id && e.from && e.to)
          // ts is preserved (additive, invariant 4) so credence() can weight an
          // attestation by the attester's tenure — see src/credence.js.
          s.edges[e.id] = { id: e.id, kind: e.kind, from: e.from, to: e.to, scope: e.scope ?? 'published', sig: e.sig, ...(e.chosen != null ? {chosen:e.chosen} : {}), ...(e.dim ? { dim: e.dim } : {}), ...(e.terms ? {terms:e.terms} : {}), ...(Array.isArray(e.audience) && e.audience.length ? { audience: e.audience } : {}), ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'edge.scoped':
        // only the original signer may re-scope their own edge. a re-scope may
        // set, change, or clear the audience (when audience is absent in the
        // event, the existing audience — if any — is dropped). this matches
        // the constructor's "omitted bytes-identically when absent" contract.
        if (s.edges[e.id] && e.by === s.edges[e.id].from) {
          const { audience: _drop, ...rest } = s.edges[e.id];
          s.edges[e.id] = {
            ...rest,
            scope: e.scope,
            ...(Array.isArray(e.audience) && e.audience.length ? { audience: e.audience } : {}),
          };
        }
        break;
      case 'node.linked':
        // Historical ids omitted the author. A foreign reference cannot replace
        // the child owner's placement at that shared legacy id.
        if (s.links[e.id]?.by === s.nodes[e.child]?.owner && e.by !== s.nodes[e.child]?.owner) break;
        if (e.id && e.parent && e.child) s.links[e.id] = { id: e.id, parent: e.parent, child: e.child, rel: e.rel ?? 'contains', by: e.by, ...(e.coords ? { coords: e.coords } : {}), ...(e.v === 2 ? {v:2, seq:e.seq} : {}) };
        break;
      case 'node.placed':
        // D2b: a parentless placement claim — child sits at a pure coordinate
        if (e.id && e.child && e.coords) s.placements[e.id] = { id: e.id, child: e.child, coords: e.coords, by: e.by };
        break;
      case 'capability.granted':
        // D9: a scoped grant; `until` is stored raw, expiry is decided at read time
        if (e.id && e.by && e.to && e.scope) {
          const key=JSON.stringify([e.by,e.to,e.scope.target,e.scope.can]);
          const previous=grants.get(key);
          if(previous) s.capabilities[previous].superseded=true;
          grants.set(key,e.id);
          s.capabilities[e.id] = { id: e.id, by: e.by, to: e.to, scope: e.scope, until: e.until ?? null, revoked: false };
        }
        break;
      case 'capability.revoked':
        // only the original grantor may revoke their own grant
        if (s.capabilities[e.id] && e.by === s.capabilities[e.id].by) s.capabilities[e.id] = { ...s.capabilities[e.id], revoked: true };
        break;
      case 'role.assigned':
        // D10: a signed claim that `subject` holds `role` in `context`, asserted by `by`
        if (e.id && e.subject && e.role && e.by) {
          const key=JSON.stringify([e.by,e.subject,e.role,e.context??null]);
          const previous=assignments.get(key);
          if(previous) delete s.roles[previous];
          assignments.set(key,e.id);
          s.roles[e.id] = { id: e.id, subject: e.subject, role: e.role, context: e.context ?? null, by: e.by };
        }
        break;
      case 'role.released':
        // only the original assigner (withdraw) or the subject (step back) may release
        if (s.roles[e.id] && (e.by === s.roles[e.id].by || e.by === s.roles[e.id].subject)) delete s.roles[e.id];
        break;
      case 'node.marked':
        // a signed status claim (e.g. 'done') on a node; latest per (signer, cid, mark)
        // wins, so a superseding {on:false} un-marks. WHO marked is kept (provenanced).
        if (e.id && e.cid && e.mark && e.by) s.marks[e.id] = { id: e.id, cid: e.cid, mark: e.mark, on: e.on !== false, by: e.by, ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'tag.applied':
        // schemaless label on a node cid or identity pub. Stored in its own map so it
        // never touches edges/knows/credence — a tag carries discovery signal, not trust.
        if (e.id && e.by && e.target && e.label != null)
          s.tags[e.id] = { id: e.id, by: e.by, target: e.target, label: e.label, ...(Array.isArray(e.audience) && e.audience.length ? { audience: e.audience } : {}), ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'tag.removed':
        // only the original tagger may retract their own tag; the log keeps both events.
        if (s.tags[e.id] && e.by === s.tags[e.id].by) delete s.tags[e.id];
        break;
      case 'identity.renamed':
        // self-rename: only the identity's own key can sign this (checked in
        // verifyEvents). Overwrite the derived name; the old identity.minted stays.
        if (e.pub && e.name != null && s.identities[e.pub]) s.identities[e.pub].name = e.name;
        break;
      case 'node.renamed':
        // owner-rename: only the node's owner can sign this (checked in verifyEvents
        // against e.by; the reducer also guards owner === e.by). Overwrite the name.
        if (e.cid && e.name != null && s.nodes[e.cid] && s.nodes[e.cid].owner === e.by) s.nodes[e.cid].name = e.name;
        break;
      case 'node.noted':
        // owner sets/edits the freeform note (content, not identity — not in the CID).
        // Latest in log wins; only the node's owner may note their own thing. A directed note
        // arrives SEALED (`enc`): the reducer stores the opaque blob and decryption is a read-time
        // concern, so the secret seed never enters the pure reducer and the body stays confidential
        // here. Plaintext path is untouched, so pre-encryption logs reduce byte-identically.
        if (e.cid && s.nodes[e.cid] && s.nodes[e.cid].owner === e.by) {
          if (e.enc != null) { s.nodes[e.cid].encNote = e.enc; delete s.nodes[e.cid].note; }
          else if (e.note != null) { s.nodes[e.cid].note = e.note; delete s.nodes[e.cid].encNote; }
        }
        break;
      case 'claim.challenged':
        // a signed dispute of a claim (edge id / tag id / node cid). Stored in its own map
        // so it never touches edges/knows/credence — perspective-relativity is applied at
        // read time (challengesFrom), like tags it carries signal, not a stored verdict.
        if (e.id && e.by && e.target)
          s.challenges[e.id] = { id: e.id, by: e.by, target: e.target, ...(e.reason != null ? { reason: e.reason } : {}), ...(e.dim ? { dim: e.dim } : {}), ...(e.evidence ? { evidence: e.evidence } : {}), ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'claim.withdrawn':
        // only the original challenger may withdraw their own challenge; the log keeps both.
        if (s.challenges[e.id] && e.by === s.challenges[e.id].by) delete s.challenges[e.id];
        break;
      case 'expense.logged':
        // a signed shared-cost CLAIM, scoped to a space (context). Stored in its own `expenses`
        // map. ACCOUNTING, not credence: balances are a plain deterministic sum over these (see
        // src/ledger.js), never trust-weighted, never perspective-relative. Not an ownership
        // transfer, not a conserved balance — the real money moved on an external rail.
        if (e.id && e.by && e.context && Number.isFinite(Number(e.amount)) && Number(e.amount) > 0)
          s.expenses[e.id] = { id: e.id, by: e.by, context: e.context, amount: Number(e.amount), currency: e.currency ?? 'EUR', what: e.what ?? '', split: Array.isArray(e.split) ? e.split : [], ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'expense.voided':
        // only the original logger voids their own expense; the row stays (struck), stops counting
        if (s.expenses[e.id] && e.by === s.expenses[e.id].by) s.expenses[e.id] = { ...s.expenses[e.id], voided: true };
        break;
      case 'settlement.logged':
        // a signed PAYMENT claim (settle-up) — the debts' discharge side; same accounting plane
        if (e.id && e.by && e.to && e.context && Number.isFinite(Number(e.amount)) && Number(e.amount) > 0)
          s.settlements[e.id] = { id: e.id, by: e.by, to: e.to, context: e.context, amount: Number(e.amount), currency: e.currency ?? 'EUR', what: e.what ?? '', ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'comment.attached':
        // discussion attached to a thing; its own map, append-only (comments accumulate, no
        // latest-wins). Never touches edges/credence — carries the *why*, not a verdict.
        if (e.id && e.by && e.target && e.body != null)
          s.comments[e.id] = { id: e.id, by: e.by, target: e.target, body: e.body, ...(e.replyTo ? { replyTo: e.replyTo } : {}), ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      case 'message.sent':
        // a directed message from `by` to a PERSON (pubkey `to`); its own map, append-only
        // (messages accumulate, no latest-wins). The reducer carries it for render and derives
        // NOTHING from it — credence.js and the knows-graph never read messages, so a message
        // holds no weight until crystallize mints a node (invariant 4: total, render-only).
        if (e.id && e.by && e.to && e.body != null)
          s.messages[e.id] = { id: e.id, by: e.by, to: e.to, body: e.body, ...(e.replyTo ? { replyTo: e.replyTo } : {}), ...(e.ts != null ? { ts: e.ts } : {}) };
        break;
      default:
        break;                                                        // unknown type → ignore (forward-compatible)
    }
  }
  settleContainment(s);
  return s;
}

/* read: comments attached to a node, oldest→newest (discussion is append-only). */
export function commentsOn(state, cid) {
  return repliesAfterSources(Object.values(state.comments || {}).filter((c) => c.target === cid).sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.id.localeCompare(b.id)));
}

/* read: the dyad stream — every message between two pubkeys, either direction, oldest→newest. */
export function messagesBetween(state, a, b) {
  return repliesAfterSources(Object.values(state.messages || {})
    .filter((m) => (m.by === a && m.to === b) || (m.by === b && m.to === a))
    .sort((x, y) => (x.ts || 0) - (y.ts || 0) || x.id.localeCompare(y.id)));
}

/* ---- signature audit: every claim verifies from its public key alone ----
   `verify(pubHex, sigHex, payload) → bool|Promise<bool>` is injected (env-specific). */

export async function verifyEvents(events, verify) {
  const out = [];
  for (const e of events) out.push({t:e?.t, ref:e?.id ?? e?.cid ?? e?.pub ?? null, ok:await verifyEvent(e, verify)});
  return out;
}
