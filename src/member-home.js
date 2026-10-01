import {page,escape,placesBody,recordCards} from './views.js';
import {displayName} from './presentation.js';

const actions={membership_approved:'Membership approved',membership_revoked:'Membership withdrawn',
  introduction_confirmed:'Introduction confirmed',introduction_withdrawn:'Introduction withdrawn'};

// A bounded private view of existing history. No new identity, grant or log is
// created by reading it, and no administrator details or raw proofs are returned.
export function recentChanges(db,account,clients,organisationChanges=[]) {
  const sites=new Map(clients.map(c=>[c.client_id,c]));
  const sharing=db.prepare('SELECT client,event FROM receipts WHERE account=? ORDER BY id DESC LIMIT 8').all(account)
    .flatMap(row=>{
      const site=sites.get(row.client),event=JSON.parse(row.event);
      if(!site||event.t!=='node.minted'||!['share','withdraw'].includes(event.body?.permission))return [];
      return [{at:new Date(event.ts).toISOString(),label:event.body.permission==='share'?'Sharing choices saved':'Website disconnected',
        name:site.name,client:row.client}];
    });
  const approvals=organisationChanges.filter(change=>actions[change.action]).map(change=>({
    at:change.at,label:actions[change.action],name:change.organisation,client:null
  }));
  return [...sharing,...approvals].filter(change=>Number.isFinite(Date.parse(change.at)))
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8);
}

export function memberHomeView(config,sharing,{details={},activity=[],csrf}) {
  const base=config.basePath??'/identity',brand=displayName(config),frrn=config.accountSource==='frrn';
  const connected=sharing.places.filter(p=>p.active).length;
  const recordCount=sharing.memberships.length+sharing.confirmations.length;
  const date=value=>escape(new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}));
  return page('Your '+brand,`<section class="member-home">
    <div class="member-welcome"><div><p class="eyebrow">Your private member home</p><h1>Your ${escape(brand)}</h1><p class="lead small">Your identities, records and website connections.</p></div><span class="badge">Signed in</span></div>
    <nav class="member-sections" aria-label="On this page"><a href="#your-identity">Identity</a><a href="#your-records">Records <span>${recordCount}</span></a><a href="#your-connections">Connections <span>${connected}</span></a><a href="#recent-changes">Recent changes</a></nav>
    <section class="member-identity" id="your-identity" aria-labelledby="identity-heading"><div><p class="eyebrow">Private to your account</p><h2 id="identity-heading">Your identity</h2>
      ${details.email?`<p class="member-email">${escape(details.email)}</p><p class="help">Your sign-in email is not shared with connected websites.</p>`:`<p>You are signed in through ${frrn?'FRRN':'this account service'}. Each website gets its own identity and the name you choose there.</p>`}
      <p>A different name for each place. Review your website identities below.</p></div>
      <div class="member-custody"><h3>Who holds your records?</h3><p>${frrn?'FRRN holds your account and community approvals. '+escape(config.operatorName)+' holds your website identity keys and sharing choices.':escape(config.operatorName)+' holds your website identity keys and sharing choices. '+(details.email?'Your account and organisation approval records are stored with this service.':'Membership records come from your account service.')}</p><p class="help">The operator can associate your website identities with this account.</p>
      <details id="account-recovery"><summary>Sign-in & recovery</summary>${details.email?`<p>Sign in with a code sent to your email. If you lose access to that email, ask ${escape(config.operatorName)} to review recovery with you. Automatic lost-mailbox recovery is not available.</p>`:`<p>Your account provider manages sign-in and recovery.</p>${frrn?'<a href="/account">Manage your FRRN account</a>':''}`}
      <p><a href="${base}/sharing-summary">Download your sharing summary</a>. This records your choices; it cannot restore your account or keys.</p>${details.canSignOut?`<form method="post" action="${base}/logout"><input type="hidden" name="csrf" value="${escape(csrf(base+'/logout'))}"><button class="secondary">Sign out of this account</button></form>`:''}</details></div></section>
    <section class="member-section" id="your-records" aria-labelledby="records-heading"><div class="member-section-heading"><h2 id="records-heading">Your records</h2><a href="${base}/records">Record details →</a></div><p>Current memberships and confirmations you can choose to share. Nothing is shared just by viewing this page.</p>
      ${recordCards(config,sharing.memberships,'Membership')}${sharing.confirmations.length?`<h3 class="member-subheading">Confirmations</h3>${recordCards(config,sharing.confirmations,'Confirmation')}`:''}</section>
    <section class="member-section" id="your-connections" aria-labelledby="connections-heading">${placesBody(config,sharing,id=>csrf(base+'/sites/'+id+'/disconnect'),null,{home:true})}</section>
    <section class="member-section" id="recent-changes" aria-labelledby="changes-heading"><h2 id="changes-heading">Recent changes</h2><p class="help">Recorded sharing changes${details.activity?' and organisation updates':''}. This is not a log of visits to other websites. Times are UTC.</p>
      ${activity.length?`<ol class="member-activity">${activity.map(change=>`<li><div><strong>${escape(change.label)}</strong>${change.client?`<a href="${base}/sites?place=${escape(encodeURIComponent(change.client))}">${escape(change.name)}</a>`:`<span>${escape(change.name)}</span>`}</div><time datetime="${escape(change.at)}">${date(change.at)}</time></li>`).join('')}</ol>`:'<p class="records-empty">No changes recorded here yet. Your first connection starts at a website that uses this service.</p>'}</section>
    ${details.organisations?.length||details.isOperator?`<section class="member-admin" aria-labelledby="admin-heading"><h2 id="admin-heading">Organisation administration</h2>${details.organisations?.length?`<ul>${details.organisations.map(org=>`<li><a href="${base}/organisations/${escape(encodeURIComponent(org.id))}">${escape(org.name)}</a></li>`).join('')}</ul>`:''}${details.isOperator?`<a href="${base}/operator">Register an organisation</a>`:''}</section>`:''}
    <p class="member-privacy">Each website decides what grants access. Disconnecting stops new access through this service; a website may retain earlier copies. <a href="${base}/about">How your information is handled</a></p>
  </section>`,config);
}
