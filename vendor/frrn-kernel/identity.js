/**
 * identity.js — Node Ed25519 signer + verifier (the server/CLI backend).
 * Implements the signer interface events.js expects: { name, pub, sign(payload) }.
 * The browser backend (web/identity.web.js) implements the same shape via Web Crypto.
 *
 * Possession of the secret key is the only proof of ownership; the public key IS
 * the identity. Same curve pubky uses (Ed25519) — see seedOf() for the bridge.
 */
import { generateKeyPairSync, sign, verify as nverify, createPublicKey } from 'node:crypto';
import { canon } from './core.js';

export { canon, cidOf } from './core.js';

/** mint a fresh identity (a signer). */
export function newIdentity(name = null) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x;          // base64url, 32 bytes
  const pub = Buffer.from(x, 'base64url').toString('hex');
  return {
    name, pub, privateKey, publicKey,
    sign(payload) { return sign(null, canon(payload), privateKey).toString('hex'); },
  };
}

/** reconstruct a public-key object from its hex (for permissionless verify). */
export function pubKeyObj(pubHex) {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pubHex, 'hex').toString('base64url') },
    format: 'jwk',
  });
}

/** verify a signature against a public-key hex and the payload — no lookup needed. */
export function verify(pubHex, sigHex, payload) {
  try { return nverify(null, canon(payload), pubKeyObj(pubHex), Buffer.from(sigHex, 'hex')); }
  catch { return false; }
}

/** the raw 32-byte Ed25519 seed — bridges a kernel identity to a pubky Keypair. */
export const seedOf = (id) => new Uint8Array(Buffer.from(id.privateKey.export({ format: 'jwk' }).d, 'base64url'));
