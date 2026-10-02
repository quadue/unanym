import {escape} from './views.js';
import {displayName,glyphs,memberPage} from './presentation.js';
import {createHash} from 'node:crypto';

const actions={membership_approved:'Approved',membership_revoked:'Withdrawn',
  introduction_confirmed:'Confirmed',introduction_withdrawn:'Confirmation withdrawn',passkey_added:'Passkey added',passkey_removed:'Passkey removed'};

// A bounded private view of existing history. No new identity, grant or log is
// created by reading it, and no administrator details or raw proofs are returned.
export function recentChanges(db,account,clients,organisationChanges=[],limit=8) {
  const sites=new Map(clients.map(c=>[c.client_id,c]));
  const sharing=db.prepare('SELECT id,client,event FROM receipts WHERE account=? ORDER BY id DESC').all(account)
    .flatMap(row=>{
      const site=sites.get(row.client),event=JSON.parse(row.event);
      if(!site||event.t!=='node.minted'||!['share','withdraw'].includes(event.body?.permission))return [];
      return [{id:'sharing:'+row.id,at:new Date(event.ts).toISOString(),label:event.body.permission==='share'?'Shared':'Disconnected',
        name:site.name,client:row.client}];
    });
  const approvals=organisationChanges.filter(change=>actions[change.action]).map(change=>({
    id:'approval:'+(change.id??createHash('sha256').update(JSON.stringify(change)).digest('hex')),at:change.at,label:actions[change.action],name:change.organisation,client:null
  }));
  return [...sharing,...approvals].filter(change=>Number.isFinite(Date.parse(change.at)))
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.id.localeCompare(a.id,'en',{numeric:true})).slice(0,limit);
}

export function memberUpdates(db,account,clients,details={}) {
  const read=new Set(db.prepare('SELECT update_id FROM member_update_reads WHERE account=?').all(account).map(r=>r.update_id));
  return [...recentChanges(db,account,clients,details.activity,Infinity),...(details.expiryUpdates??[])]
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.id.localeCompare(a.id,'en',{numeric:true})).map(update=>({...update,unread:!read.has(update.id)}));
}

export function markUpdatesRead(db,account,ids,available) {
  if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'||id.length>300))throw new Error('Return to your updates and try again.');
  const own=new Set(available.map(update=>update.id));
  if(ids.some(id=>!own.has(id)))throw new Error('Return to your updates and try again.');
  db.transaction(()=>{for(const id of ids)db.prepare('INSERT OR IGNORE INTO member_update_reads VALUES(?,?)').run(account,id);})();
}

const when=value=>escape(new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}));
export function updateReadForm(config,updates,csrf,page=null) {
  const unread=updates.filter(u=>u.unread),base=config.basePath??'/identity';
  return unread.length?`<form method="post" action="${base}/updates/read" class="member-read-form"><input type="hidden" name="csrf" value="${escape(csrf(base+'/updates/read'))}">${unread.map(u=>`<input type="hidden" name="updates" value="${escape(u.id)}">`).join('')}${page===null?'':`<input type="hidden" name="page" value="${page}">`}<button class="member-action">Mark shown as read</button></form>`:'';
}

export function updatesView(config,updates,{details,csrf,page=0}) {
  const base=config.basePath??'/identity',size=50,start=page*size,shown=updates.slice(start,start+size),unread=updates.filter(u=>u.unread).length;
  return memberPage(config,'Your updates',`<section class="member-updates"><h1>Your updates</h1><p class="member-quiet">${unread?unread+' unread':'All caught up'}. Times UTC.</p><ol class="member-activity">${shown.map(u=>`<li${u.unread?' class="unread"':''}><span class="member-update-dot" aria-hidden="true"></span><span><strong>${escape(u.label)}</strong> ${escape(u.name)}${u.unread?'<small class="member-update-new">Unread</small>':''}</span><time datetime="${escape(u.at)}">${when(u.at)}</time></li>`).join('')}</ol>${updateReadForm(config,shown,csrf,page)}
    <nav class="member-pagination" aria-label="Update pages">${page>0?`<a href="${base}/updates?page=${page-1}">Newer updates</a>`:''}${start+size<updates.length?`<a href="${base}/updates?page=${page+1}">Older updates</a>`:''}</nav><p><a href="${base}/account">Back to your account</a></p></section>`,{csrf,canSignOut:details.canSignOut});
}

// The landing's colour meanings: communities each get a colour of their own,
// each website is shown one face of you (coral, amber, blue), structure is grey.
const communityColours=4;
const faceFor=i=>[['left','coral'],['right','amber'],['top','blue']][i%3];
const numbers=['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
const previewLimit=6;


export function memberHomeView(config,sharing,{details={},activity=[],updates,csrf}) {
  const base=config.basePath??'/identity',brand=displayName(config),frrn=config.accountSource==='frrn';
  const when=(value,time=true)=>escape(new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',...(time?{hour:'2-digit',minute:'2-digit'}:{year:'numeric'}),timeZone:'UTC'}));
  const colours=new Map();
  const colourOf=organisation=>{if(!colours.has(organisation))colours.set(organisation,'tone-'+colours.size%communityColours);return colours.get(organisation);};
  sharing.memberships.forEach(m=>colourOf(m.organisation));sharing.confirmations.forEach(c=>colourOf(c.organisation));
  const organisationOf=new Map(sharing.memberships.map(m=>[m.slug,m.organisation]));
  const connected=sharing.places.filter(p=>p.active).length;
  const faceOf=client=>{const i=sharing.places.findIndex(p=>p.client===client);return i<0||!sharing.places[i].active?['left','mute']:faceFor(i);};
  const tokens=(items,round)=>items.map(([label,organisation])=>`<li class="${colourOf(organisation)}">${glyphs.token(12,round)}${escape(label)}</li>`).join('');

  const organisations=[...colours.keys()];
  const communities=organisations.length?organisations.slice(0,previewLimit).map(organisation=>{
    const membership=sharing.memberships.find(m=>m.organisation===organisation);
    const confirmations=sharing.confirmations.filter(c=>c.organisation===organisation);
    return `<li class="member-node member-community ${colourOf(organisation)}">${glyphs.community(34)}<div><strong>${escape(organisation)}</strong>
      <small>${membership?'Member'+(membership.validUntil?' · until '+when(membership.validUntil,false):''):'Not a member'}</small>
      ${confirmations.length?`<ul class="member-tokens">${tokens(confirmations.map(c=>[c.name,organisation]),true)}</ul>`:''}</div></li>`;
  }).join(''):`<li class="member-node member-empty"><span class="member-hollow" aria-hidden="true"></span><div><strong>No memberships yet</strong><small>An organiser approves you</small></div></li>`;

  const websites=sharing.places.length?sharing.places.slice(0,previewLimit).map((p,i)=>{
    const [side,colour]=faceFor(i),shared=[...p.memberships.map(m=>[m.name,organisationOf.get(m.slug)??m.name,false]),...p.confirmations.map(c=>[c.name,c.organisation,true])];
    return `<li class="member-node member-site face-${p.active?colour:'off'}${p.active?'':' off'}" data-place="${escape(p.client)}">
      <div class="member-site-head">${glyphs.face(side,p.active?colour:'mute',13)}<div><strong>${escape(p.site.name)}</strong><span>${escape(new URL(p.site.homepage).host)}</span></div>
      <a class="member-open" href="${escape(p.active?p.site.homepage:(p.site.sharing_uri??p.site.homepage))}">${p.active?'Open':'Connect again'} <span aria-hidden="true">↗</span></a></div>
      <div class="member-gets"><span class="member-as">${p.active?'Sees':'Saw'} <b>${escape(p.name)}</b></span>${p.active?(shared.length?`<ul class="member-tokens">${shared.map(([label,organisation,round])=>`<li class="${colourOf(organisation)}">${glyphs.token(12,round)}${escape(label)}</li>`).join('')}</ul>`:'<span class="member-only">Name only</span>'):'<span class="member-only">Stopped · may keep earlier copies</span>'}</div>
      ${p.unavailable?'<p class="member-changed">Some earlier choices are no longer available.</p>':''}
      <div class="member-site-foot">${p.active&&p.site.sharing_uri?`<a class="member-action" href="${escape(p.site.sharing_uri)}">Change</a>`:''}${p.active?`<form method="post" action="${base}/sites/${escape(encodeURIComponent(p.client))}/disconnect"><input type="hidden" name="csrf" value="${escape(csrf(base+'/sites/'+p.client+'/disconnect'))}"><button class="member-action" type="submit">Disconnect</button></form>`:''}
      <details class="place-identity"><summary>Identifier</summary><dl>${p.identity?`<dt>For this website only</dt><dd>${escape(p.identity.subject)}</dd><dt>Public key</dt><dd>${escape(p.identity.publicKey)}</dd>`:''}</dl><a href="${base}/sites/${escape(encodeURIComponent(p.client))}/receipt">Signed record ↓</a></details></div></li>`;
  }).join(''):`<li class="member-node member-empty"><span class="member-hollow" aria-hidden="true"></span><div><strong>No websites yet</strong><small>Choose Continue with ${escape(brand)} on one</small>${config.clients?.some(c=>c.client_id==='example')?`<a class="member-action" href="${base}/example/">Try the example</a>`:''}</div></li>`;

  const centre=`<div class="member-you">${glyphs.you(66,32)}<span class="member-you-label">You</span>
    ${details.email?`<div class="member-kept">${glyphs.email()}<span class="member-email">${escape(details.email)}</span><small>Stays here</small></div>`:''}</div>`;

  const unread=updates?.filter(u=>u.unread).length??0;
  const recent=activity.length?`<ol class="member-activity">${activity.map(change=>`<li${change.unread?' class="unread"':''}>${change.client?glyphs.face(...faceOf(change.client),8):`<span class="${colourOf(change.name)}">${glyphs.token(10)}</span>`}<span><strong>${escape(change.label)}</strong> ${change.client?`<a href="${base}/sites?place=${escape(encodeURIComponent(change.client))}">${escape(change.name)}</a>`:escape(change.name)}${change.unread?'<small class="member-update-new">Unread</small>':''}</span><time datetime="${escape(change.at)}">${when(change.at)}</time></li>`).join('')}</ol>`
    :'<p class="member-quiet">Nothing yet.</p>';

  const holders=frrn?`<dt>Account &amp; approvals</dt><dd>FRRN</dd><dt>Website keys</dt><dd>${escape(config.operatorName)}</dd>`:`<dt>Held by</dt><dd>${escape(config.operatorName)}</dd>`;
  const admin=details.organisations?.length||details.isOperator?`<div class="member-admin"><h3>You organise</h3><ul>${(details.organisations??[]).map(org=>`<li><a href="${base}/organisations/${escape(encodeURIComponent(org.id))}">${escape(org.name)}</a></li>`).join('')}${details.isOperator?`<li><a href="${base}/operator">Register an organisation</a></li>`:''}</ul></div>`:'';

  return memberPage(config,'Your '+brand,`<section class="member-top"><h1>One you.<br>${numbers[connected]??connected} ${connected===1?'place':'places'}${connected?'':' yet'}.</h1>
    <p>What each website gets from you.</p></section>
  <div class="member-map${organisations.length?'':' no-in'}${sharing.places.length?'':' no-out'}">
    <section class="member-col member-in" aria-labelledby="communities-heading"><h2 class="member-label" id="communities-heading">Communities</h2><ul class="member-nodes">${communities}</ul>${organisations.length?`<p class="member-list-more">${organisations.length>previewLimit?`Showing ${previewLimit} of ${organisations.length} communities.<br>`:''}<a href="${base}/records">Memberships &amp; confirmations →</a></p>`:''}</section>
    ${centre}
    <section class="member-col member-out" aria-labelledby="websites-heading"><h2 class="member-label" id="websites-heading">Websites</h2><ul class="member-nodes">${websites}</ul>${sharing.places.length?`<p class="member-list-more">${sharing.places.length>previewLimit?`Showing ${previewLimit} of ${sharing.places.length} websites.<br>`:''}<a href="${base}/sites">All websites →</a></p>`:''}</section>
  </div>
  <ul class="member-legend" aria-label="Key"><li>${glyphs.token(10)}Membership</li><li>${glyphs.token(10,true)}Confirmation</li><li><i class="wire"></i>Shared</li><li><i class="wire off"></i>Disconnected</li></ul>
  <div class="member-lower">
    <section aria-labelledby="changes-heading"><details class="member-recent"><summary id="changes-heading">Recent changes${unread?` <span class="member-unread-count">${unread} unread</span>`:''}</summary>${recent}${updates?updateReadForm(config,activity,csrf)+`<p><a class="member-action" href="${base}/updates">All updates →</a></p>`:''}<p class="member-quiet">Changes saved here, not website visits. Times UTC.</p></details></section>
    <section aria-labelledby="account-heading" class="member-account"><h2 class="member-label" id="account-heading">Account</h2><dl>${holders}</dl>
      <p class="member-quiet">The operator can link your websites to this account.</p>
      ${details.canManagePasskeys?`<p><a class="member-download" href="${base}/security">Passkeys →</a></p>`:''}
      <details id="account-recovery"><summary>Recovery</summary><p>${details.email?`Sign in with ${details.canManagePasskeys?'an added passkey or ':''}a code sent to your email. ${details.canManagePasskeys?'Lost both?':'Lost the mailbox?'} Ask ${escape(config.operatorName)}.`:frrn?'FRRN handles sign-in and recovery. <a href="/account">Manage your FRRN account</a>':'Your account provider handles sign-in and recovery.'}</p></details>
      <a class="member-download" href="${base}/sharing-summary">Sharing summary ↓</a>${admin}</section>
  </div>`,{csrf,canSignOut:details.canSignOut});
}
