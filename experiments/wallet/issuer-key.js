import {readFileSync} from 'node:fs';
// The fictional issuer's key comes from the local walt.id test configuration at run
// time; it is a published test key and is never copied into this repository.
export function testIssuerKey(path=process.env.WALTID_PROFILES??`${process.env.HOME}/wallet-experiment/config/issuer-api2/issuer2-profiles.conf`) {
  const block=/defaultIssuerKey\s*=\s*\{[\s\S]*?jwk\s*=\s*\{([\s\S]*?)\}/.exec(readFileSync(path,'utf8'))[1];
  const jwk=Object.fromEntries([...block.matchAll(/(\w+)\s*=\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
  const {d,...pub}=jwk;
  return {privateJwk:jwk,publicJwk:pub};
}
