import { createCipheriv,createDecipheriv,createPrivateKey,createPublicKey,randomBytes,randomUUID,sign } from 'node:crypto';
import { canon,newIdentity,verify } from '../vendor/frrn-kernel/identity.js';
import { mintIdentity,mintNode } from '../vendor/frrn-kernel/events.js';
import { observeEvents,verifyEvent } from '../vendor/frrn-kernel/event-schema.js';

export function seal(text,key) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(x=>x.toString('base64url')).join('.');
}
export function unseal(text,key) {
  const [iv,tag,body]=text.split('.').map(x=>Buffer.from(x,'base64url'));
  const decipher=createDecipheriv('aes-256-gcm',key,iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');
}
export function signerFrom(jwk) {
  const privateKey=createPrivateKey({key:jwk,format:'jwk'}),publicKey=createPublicKey(privateKey);
  const pub=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url').toString('hex');
  return {pub,name:null,sign:payload=>sign(null,canon(payload),privateKey).toString('hex')};
}
export async function persona(db,account,client,key) {
  let row=db.prepare('SELECT * FROM personas WHERE account=? AND client=?').get(account,client);
  if(!row) {
    const signer=newIdentity();
    const identity=await mintIdentity(signer);
    db.prepare('INSERT OR IGNORE INTO personas VALUES (?,?,?,?,?)').run(account,client,randomUUID(),seal(JSON.stringify(signer.privateKey.export({format:'jwk'})),key),JSON.stringify(identity));
    row=db.prepare('SELECT * FROM personas WHERE account=? AND client=?').get(account,client);
  }
  const identity=JSON.parse(row.identity_event),signer=signerFrom(JSON.parse(unseal(row.private_key,key)));
  // Restore sequence knowledge from authenticated history after a restart.
  const events=db.prepare('SELECT event FROM receipts WHERE account=? AND client=?').all(account,client).map(x=>JSON.parse(x.event));
  observeEvents([identity,...events]);
  return {...row,identity,signer};
}
export async function consentReceipt(db,person,choice,config={}) {
  const standalone=config.contract==='community-v1';
  const event=await mintNode(person.signer,{face:'object',name:choice.active?'Website sharing permission':'Website disconnected',body:{
    schema:standalone?'community.identity.consent.v1':'drop.identity.consent.v1',website:person.client,displayName:choice.name,
    sharedCommunities:choice.memberships,permission:choice.active?'share':'withdraw',
    custody:standalone?'operator':'pact-hosted',...(standalone?{operator:config.issuer}:{}),explanation:standalone?'Signed by the operator on the account holder’s request. The operator holds this website-specific key.':'Signed by Firn on the account holder’s request. The service holds this website-specific key.'
  }});
  db.prepare('INSERT INTO receipts(account,client,event) VALUES (?,?,?)').run(person.account,person.client,JSON.stringify(event));
  return event;
}
export async function membershipReceipt(signer,{issuer,subject,client,memberships}) {
  return mintNode(signer,{face:'object',name:'Current community memberships',body:{
    schema:'drop.identity.memberships.v1',issuer,subject,audience:client,
    memberships:memberships.map(({slug,name})=>({slug,name})),validUntil:new Date(Date.now()+300_000).toISOString(),
    evidence:'Active Firn membership with current agreement consent. Does not attest to training or personal safety.'
  }});
}
export const verifyDropEvent=event=>verifyEvent(event,verify);
