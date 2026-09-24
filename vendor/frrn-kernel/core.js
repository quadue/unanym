/**
 * core.js — crypto-free primitives shared by Node and the browser.
 * (TextEncoder is global in Node 18+ and every browser.)
 */

/** recursively sort object keys so the same payload always signs the same.
 *  Arrays preserve order (semantic in our protocol).  The result is a plain
 *  object whose keys are sorted at every depth, so JSON.stringify produces
 *  a stable byte sequence regardless of how the caller constructed the input. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer)) {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = sortKeys(value[k]);
      return acc;
    }, {});
  }
  return value;
}

/** canonical bytes: stable key order at every depth. */
export const canon = (o) => new TextEncoder().encode(JSON.stringify(sortKeys(o)));

/* ---- content addressing ---- */

/** SHA-256 → CIDv1 raw codec, base32lower-encoded, with the standard `b` multibase.
 *  async because Web Crypto is async; Node's `crypto.subtle` is too in modern Node. */
export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
function base32Lower(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  // RFC 4648 base32 requires `=` padding for non-byte-aligned output;
  // multibase CIDv1 conventionally omits it. The decoder is happy either way.
  return out;
}

/** content id: address a node by its content, not its location.
 *  CIDv1 (version=1, codec=raw=0x55, multihash=sha2-256=0x12 + 32-byte digest). */
export async function cidOf(obj) {
  const digest = await sha256(canon(obj));
  const cidBytes = new Uint8Array([0x01, 0x55, 0x12, 0x20, ...digest]);
  return 'b' + base32Lower(cidBytes);
}

/* ---- hex helpers ---- */

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const unhex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
