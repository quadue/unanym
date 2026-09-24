/** Shared containment and disclosure policy. References never confer access. */
export const grantActive = (g, now = Date.now()) => !!g && !g.revoked && !g.superseded && (g.until == null || g.until > now);
export function ownerViewGrants(state, cid) {
  const owner = state.nodes?.[cid]?.owner;
  return owner == null ? [] : Object.values(state.capabilities ?? {}).filter(g => !g.superseded && g.by === owner && g.scope?.can === 'view' && g.scope.target === cid);
}
export function containmentParent(state, cid) {
  return Object.values(state.links ?? {}).find(l => l.rel === 'contains' && l.child === cid && l.by === state.nodes?.[cid]?.owner && state.nodes?.[l.parent])?.parent ?? null;
}
export function ownChain(state, cid) {
  const chain = [], seen = new Set();
  let cur = cid;
  while (cur && !seen.has(cur)) {
    seen.add(cur); chain.push(cur);
    const up = containmentParent(state, cur);
    cur = up && state.nodes?.[up]?.owner === state.nodes?.[cur]?.owner ? up : null;
  }
  return chain;
}
export function effectiveAccess(state, viewer, target, now = Date.now(), can = 'view') {
  const node = state.nodes?.[target];
  if (!node) return {allowed:false, owner:false, grants:[]};
  if (viewer != null && node.owner === viewer) return {allowed:true, owner:true, grants:[]};
  const grants = [];
  // Read cascades; contribute/edit authority must be explicitly granted at the target.
  const chain = can === 'view' ? ownChain(state, target) : [target];
  for (const via of chain) for (const g of Object.values(state.capabilities ?? {})) {
    if (g.by === node.owner && g.scope?.target === via && g.scope.can === can && grantActive(g, now)
      && (g.to === '*' || (viewer != null && g.to === viewer))) grants.push({g, via});
  }
  return {allowed:grants.length > 0, owner:false, grants};
}

/** One child-owner-signed placement. Legacy competing parents are references until
 * the child owner signs a new placement. New placements select the greatest signed
 * sequence (stable id breaks concurrent ties). Invalid links remain references.
 * Cycles confer no containment or inherited disclosure.
 */
export function settleContainment(state) {
  const groups = new Map();
  for (const l of Object.values(state.links)) if (l.rel === 'contains') {
    const list = groups.get(l.child) ?? []; list.push(l); groups.set(l.child, list);
  }
  for (const [child, links] of groups) {
    const eligible = links.filter(l => l.by === state.nodes[child]?.owner && l.child !== l.parent);
    const modern = eligible.filter(l => l.v === 2).sort((a,b) => b.seq - a.seq || b.id.localeCompare(a.id, 'en'));
    const selected = modern[0] ?? (eligible.length === 1 ? eligible[0] : null);
    for (const l of links) if (l !== selected) { l.rel = 'reference'; l.claimedRel = 'contains'; }
  }
  const parents = new Map(Object.values(state.links).filter(l => l.rel === 'contains').map(l => [l.child,l]));
  const cyclic = new Set();
  for (const start of parents.keys()) {
    const path = [], seen = new Map(); let cur = start;
    while (parents.has(cur)) {
      if (seen.has(cur)) { for (const c of path.slice(seen.get(cur))) cyclic.add(c); break; }
      seen.set(cur,path.length); path.push(cur); cur = parents.get(cur).parent;
    }
  }
  for (const c of cyclic) { const l = parents.get(c); l.rel = 'reference'; l.claimedRel = 'contains'; }
}
