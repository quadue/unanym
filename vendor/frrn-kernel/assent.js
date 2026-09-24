/** Exact agreement terms are immutable snapshots, separate from editable objects. */
import { cidOf } from './core.js';
export const partySet = parties => [...new Set(parties)].sort();
export function termsSnapshot(node, parties) {
  if (!node || !Array.isArray(parties) || !parties.length || parties.some(p=>typeof p !== 'string' || !p)) throw new TypeError('terms require a node and named parties');
  if (node.encNote != null) throw new TypeError('open the terms into an explicit proposal before assenting');
  return {object:node.cid, name:node.name, body:node.body ?? {}, note:node.note ?? null, parties:partySet(parties)};
}
export async function termsVersion(node, parties) {
  const snapshot = termsSnapshot(node,parties);
  return {version:await cidOf(snapshot), snapshot};
}
