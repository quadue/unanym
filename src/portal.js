import {readFileSync} from 'node:fs';
import {renderMarkdown} from './markdown.js';
import {displayName,developerURL} from './presentation.js';
import {exampleClient,exampleURL} from './example-site.js';
import {documentLayout} from './docs-layout.js';

// Audience guides and rendered reference documents for community-v1 hosts.
// Guides describe the implemented behaviour only; FRRN-backed and standalone
// installations differ in who holds accounts and approvals.
const ROOT=new URL('../',import.meta.url);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const referenceDocs={
  places:{file:'docs/member-places.md',title:'Member sharing views',summary:'Per-site names and sharing, record destinations, privacy and a readable export.'},
  confirmations:{file:'docs/contracts/confirmations-v1.md',title:'Optional confirmations',summary:'One separately shared community introduction confirmation; no qualification or safety score.'},
  simulation:{file:'docs/two-site-simulation.md',title:'Two-site simulation',summary:'Reproduce the fictional community and two WordPress sites; prepare a human trial.'},
  contract:{file:'docs/contracts/community-v1.md',title:'Identity v1 contract',summary:'What websites receive, the membership statement format and how the engine may be replaced.'},
  hosting:{file:'docs/standalone.md',title:'Standalone hosting',summary:'Run Unanym with its own email-code accounts and organisation administrators.'},
  'frrn-host':{file:'docs/frrn-host.md',title:'FRRN-backed hosting',summary:'Run Unanym beside FRRN, reading FRRN’s organiser approvals.'},
  'release-notes':{file:'docs/release.md',title:'Release notes',summary:'What changed in each release and what was tested.'}
};
// Relative Markdown links between the documents, mapped to their served pages.
const links={'standalone.md':'hosting','frrn-host.md':'frrn-host','community-v1.md':'contract','contracts/community-v1.md':'contract','release.md':'release-notes'};
const guides=['organisers','members','websites','operators'];
const guideTitles={organisers:'For organisers',members:'For members',websites:'For website owners',operators:'For operators'};

function shell(config,{title,body,current}) {
  const base=config.basePath??'/identity',docs=base+'/docs/',brand=escape(displayName(config));
  const home=config.accountSource==='frrn'?config.origin+'/':base+'/';
  const nav=[['Overview',developerURL(config),'overview'],['Guides',docs,'guides'],['Contract',docs+'contract','contract']]
    .map(([label,href,key])=>`<a href="${escape(href)}"${current===key?' aria-current="page"':''}>${label}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark"><title>${escape(title)} · Unanym</title><link rel="stylesheet" href="${base}/assets/front.css"><link rel="icon" href="${base}/assets/front-mark.svg" type="image/svg+xml"></head>
<body class="developer"><a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="wordmark" href="${escape(developerURL(config))}">unanym</a><nav class="doc-nav" aria-label="Documentation">${nav}<a href="${escape(home)}">${brand} ↗</a></nav></header><main id="main">
${body}
</main><footer class="site-footer"><span>Unanym · identity integration</span><a href="${escape(home)}">Back to ${brand}</a></footer><script type="module" src="${base}/assets/developer.js"></script></body></html>`;
}

export function docsIndex(config) {
  const base=config.basePath??'/identity',docs=base+'/docs/';
  const summaries={organisers:'Approve who belongs, and end an approval.',members:'Choose your name and what each website sees. Disconnect when you want.',websites:'Connect a WordPress site and open a members-only page.',operators:'Run the service, register websites, back up and recover.'};
  const reference=Object.entries(referenceDocs).filter(([key])=>key!==(config.accountSource==='frrn'?'hosting':'frrn-host'));
  const example=exampleClient(config)?`<p class="dev-note">Want to see it first? <a href="${escape(exampleURL(config))}">Try the example website</a>.</p>`:'';
  return shell(config,{title:'Guides',current:'guides',body:`<section class="hero"><div><p class="eyebrow">Guides</p><h1>What would you<br>like to do?</h1><p>Connect a website, manage memberships, choose what to share or run the service.</p></div></section>
<div class="guide-grid">${guides.map(name=>`<a class="dev-panel guide-card" href="${docs}${name}"><h2>${guideTitles[name]}</h2><p>${summaries[name]}</p></a>`).join('')}</div>
<section class="doc-reference"><h2>Reference</h2><ul>${reference.map(([key,doc])=>`<li><a href="${docs}${key}">${doc.title}</a><span>${doc.summary}</span></li>`).join('')}</ul></section>${example}`});
}

export function referencePage(config,key) {
  const doc=referenceDocs[key];
  const source=readFileSync(new URL(doc.file,ROOT),'utf8');
  const raw={contract:'community-v1.md',hosting:'standalone.md'}[key];
  const base=config.basePath??'/identity';
  return shell(config,{title:doc.title,current:key==='contract'?'contract':'guides',body:documentLayout(`${renderMarkdown(source,{links})}${raw?`<p class="doc-source"><a href="${base}/docs/${raw}">Plain-text version</a></p>`:''}`)});
}

export function guidePage(config,name) {
  const frrn=config.accountSource==='frrn',base=config.basePath??'/identity',docs=base+'/docs/';
  // Guides may be read on a separate documentation host; account pages live on the identity origin.
  const account=escape(config.origin+base);
  const brand=escape(displayName(config)),issuer=escape(config.issuer);
  const operator=config.operatorName?'the operator ('+escape(config.operatorName)+')':'the operator';
  const body={
    organisers:()=>`<h1>For organisers</h1><p class="doc-lead">You decide who belongs. Members decide which websites hear about it. Each website decides what that membership allows there.</p>
${frrn?`<h2>Before you start</h2><p>Ask ${operator} to register your community as a membership source and to name you as an authorised approver. They record your organisation’s actual appointment of you. Until then, your approvals are not shared with any website.</p>
<h2>Approve a member</h2><p>If people join your community by approval, choosing <strong>Approve</strong> on a joining request admits the person and records your approval in one step. For people who are already members, open <strong>Manage community → Membership approvals</strong> and choose <strong>Approve membership</strong>.</p>
<p>If you are your community’s only organiser, you can approve your own membership there. Once a second organiser exists, the other organiser approves you.</p>
<h2>Withdraw an approval</h2><p>Choose <strong>Withdraw approval</strong>. The person stays in your community; websites simply stop receiving that membership.</p>
<h2>What ends an approval by itself</h2><ul><li>The member leaves the community. Rejoining does not bring the approval back.</li><li>You publish a changed agreement and the member has not accepted it yet.</li><li>For a sensitive community, its safety review passes its review date.</li><li>The operator removes you as an approver. Your earlier approvals stop being shared until a recognised organiser approves again.</li></ul>
<h2>What does not count as approval</h2><p>Open joining, an invitation on its own, being a member before approvals existed, and access to a single resource. Each needs an explicit approval before it is shared.</p>`
:`<h2>Before you start</h2><p>${operator[0].toUpperCase()+operator.slice(1)} registers your organisation and appoints you as its administrator after checking that appointment. Sign in at <a href="${account}/login">${account}/login</a> with the email address the operator registered. No invitation email is sent; the operator gives you the address directly.</p>
<h2>Approve a member</h2><p>Open your organisation from <strong>Your account</strong>, enter the member’s email address and choose <strong>Approve membership</strong>. You can set an end date. The member signs in with that same email address.</p>
<h2>Withdraw an approval</h2><p>Choose <strong>Revoke membership</strong> next to the person. An approval with an end date also stops by itself on that date.</p>
<h2>Limits today</h2><p>There is no bulk import and no self-enrolment for administrators. Handing the administrator role to someone else is an offline procedure with the operator.</p>`}
<h2>How quickly websites notice</h2><p>A WordPress site checks the membership again on every page it protects, so a withdrawal closes access on the next page load. A website that keeps a signed statement can use it for at most five more minutes.</p>
<h2>What an approval means</h2><p>It says an authorised organiser of this organisation approved this person’s membership. The operator signs that statement. It does not certify training, qualifications or safety, and it is not signed with your organisation’s own key.</p>`,
    members:()=>`<h1>For members</h1><p class="doc-lead">You choose your name and which memberships each website receives. Websites never receive your email address or your account.</p>
<h2>Connect a website</h2><p>On a participating website, choose <strong>Continue with ${brand}</strong>. Sign in if asked${frrn?' with your FRRN account':' with a code sent to your email address'}. Before anything is shared, you see exactly what this website will receive.</p>
<h2>Choose a name for this website</h2><p>A first name or a pseudonym is enough. Each website can know you by a different name.</p>
<h2>Choose memberships</h2><p>Tick only what you want this website to know. Memberships you leave unticked, and your other communities, stay private. The website then decides what a membership lets you do there.</p>
<h2>If no memberships appear</h2><p>You can still choose a name and connect. Your organiser needs to approve your membership${frrn?' and the operator needs to register the community as a source':''} before it can appear here. Joining a community alone does not make its membership available to websites.</p>
<h2>What every website receives</h2><ul><li>An identifier used only for that website</li><li>The name you chose for it</li><li>The memberships you ticked, each signed by the operator</li></ul><p>A website never receives your email address, your account, memberships you did not tick, or the identifiers other websites know you by.</p>
<h2>Optional confirmations</h2><p>If your website supports them, you can separately share <strong>Community introduction completed</strong>, with the organisation that confirmed it. It is not selected automatically and does not certify training or safety.</p>
<h2>Change what you share</h2><p>Choose <strong>Change sharing</strong> on a connected website or in Your places when available. WordPress also shows your choices each time you sign in. On other websites, disconnect below and connect again.</p>
<h2>See and disconnect websites</h2><p><a href="${account}/sites">Your places</a> gives each website a card with your chosen name. Open <strong>What you share</strong> to see its current memberships and confirmations, change sharing or disconnect. Unavailable records are not sent; a disconnected card shows your previous name, not continuing sharing. Each website decides what you can access.</p><p><strong>Disconnect</strong> stops new access at once; sign-in tokens already issued expire within five minutes. A website may keep what it already received. Under <strong>Connection record</strong>, you can download the signed history of your choices for that website.</p>
<h2>See where a membership is shared</h2><p><a href="${account}/records">Memberships & confirmations</a> shows current records and their destinations. Choose a website there to open its sharing card. Expired or withdrawn records are not listed as current; the signed connection history remains available. An earlier sharing choice may apply again when a record becomes available. Review it through Change sharing if you no longer want that.</p>
<h2>Keep a copy of your choices</h2><p>Under <strong>Privacy & your records</strong> in Your places, download a readable sharing summary. It contains no sign-in secrets or private keys. It is not an account backup or a recovery kit.</p>
<h2>Who can connect the dots</h2><p>The service gives websites separate identifiers. ${operator[0].toUpperCase()+operator.slice(1)} holds the keys and can link your identities across websites, even when you use different names and share different memberships. A name or detail you share can still make you recognisable.</p>`,
    websites:()=>`<h1>For website owners</h1><p class="doc-lead">Let members sign in with ${brand} and open a members-only page for people an organisation has approved. You decide which organisations your site recognises.</p>
<h2>What you need</h2><ul><li>WordPress with PHP 8.1 or newer and the Sodium extension</li><li>The <strong>OpenID Connect Generic Client</strong> plugin (tested with 3.11.3)</li><li>The Unanym companion plugin, from the <a href="${escape(developerURL(config))}">download on the overview page</a></li><li>A staging copy of your site to test on first</li></ul>
<h2>Who registers your website?</h2><p>An operator runs the identity service and registers the websites it connects. This installation is run by ${escape(config.operatorName||'its service operator')}. Agree registration with the person providing your community’s identity service before entering connection settings. Downloading the plugin does not register your site.</p><p>If you want to run a separate service for your community, start with <a href="${docs}operators">the operator guide</a>.</p>
<h2>Connect your site</h2><ol><li>Install both plugins on the staging site.</li><li>In <strong>Settings → Unanym</strong>, copy the callback address and send it to the operator. They register your site and send you a client ID and secret through a private channel.</li><li>Enter the issuer <code>${issuer}</code>, the client ID and the secret, and save. The plugin records the operator’s membership key; check its fingerprint with the operator.</li><li>Add the ID of each organisation your site recognises. The operator or the organisation gives you these. With none added, members can sign in but share no memberships with your site.</li></ol>
<h2>Open a members-only page</h2><ol><li>Create a page and set its visibility to <strong>Private</strong>.</li><li>In <strong>Settings → Unanym</strong>, choose that page and the organisation it requires, and save the member area.</li><li>Members who share that membership see <strong>Open member area</strong> after signing in.</li></ol>
<p>Access is checked on every visit and is never a permanent role. The page stays private if the companion is disabled, and cannot be published by accident while it is the member area. Your editors and administrators keep their usual access.</p>
<h2>Test before real members use it</h2><ol><li>Sign in as a test member, share the membership and open the page.</li><li>Withdraw the approval, reload the page: access closes.</li><li>Disconnect the site in Your places: the sign-in session ends.</li></ol>
<h2>Accounts on your site</h2><p>New members become Subscribers. Existing users connect from their WordPress profile after signing in the usual way; accounts are never matched by name or email, and no email address is supplied. If the identity service cannot be reached, member access fails closed.</p>
<h2>What this does not protect</h2><p>Uploaded files and media links, your other public pages, other membership plugins, custom APIs, and caches that bypass WordPress. Set your cache to skip signed-in and private pages, and keep member files out of public uploads.</p>
<h2>Other platforms</h2><p>Any OpenID Connect client can sign members in with the authorization code flow and S256 PKCE. Checking membership statements needs the verification described in the <a href="${docs}contract">contract</a>. Only WordPress is tested.</p>`,
    operators:()=>`<h1>For operators</h1><p class="doc-lead">You run the service, hold its keys and register websites. Members and organisations rely on you to keep records, keys and website accounts continuous.</p>
<h2>Choose an installation</h2><div class="doc-table"><table><thead><tr><th>Installation</th><th>Accounts and approvals</th><th>Guide</th></tr></thead><tbody><tr><td>Standalone</td><td>Unanym’s own email-code accounts and organisation administrators</td><td><a href="${docs}hosting">Standalone hosting</a></td></tr><tr><td>FRRN-backed</td><td>FRRN accounts and FRRN organisers’ approvals</td><td><a href="${docs}frrn-host">FRRN-backed hosting</a></td></tr></tbody></table></div>
<h2>Register a website</h2><p>Add the website to the client registry with its exact callback address, and store a random secret of at least 32 characters in the separate secrets file. Each website needs its own hostname. Restart the service, then send the client ID and secret to the website’s administrator through a private channel.</p>
<h2>Offer the example website</h2><p>Register a client whose only redirect address is <code>${escape(config.origin+base)}/example/callback</code>, with no secret. After a restart the example appears at <code>${base}/example/</code> and on the overview page. It verifies what it receives the way a real website would and stores nothing; the service records the connection like any other, so members can disconnect it.</p>
<h2>Keys</h2><p>The key file holds the token-signing key, the membership-statement key, the key that seals each website-specific key, and the cookie secret. Websites pin the membership-statement key, so replace it only through a planned rotation with notice to every website.</p>
<h2>Back up and restore</h2><p>Stop the service, then run <code>scripts/backup.js</code> and <code>scripts/restore.js</code> as the hosting guide describes. Keep the issuer, client IDs, keys and profile unchanged on restore.${frrn?' Restore FRRN’s database from the same backup run; the service refuses a different FRRN database.':''}</p>
<h2>Replace the sign-in engine</h2><p>Websites identify members by issuer and per-site identifier. The <a href="${docs}contract#changing-the-underlying-engine">contract lists the conditions</a> under which the engine can change without websites noticing.</p>
<h2>Check the service</h2><p><code>${base}/health</code> reports the service, its version and its contract.</p>
<h2>Before real members</h2><p>Name a security contact, test email delivery to real inboxes, and record each organisation’s actual appointment of its approvers. Tests and fictional rehearsals do not establish any of these.</p>`
  }[name];
  return shell(config,{title:guideTitles[name],current:'guides',body:documentLayout(`${body()}<p class="doc-source"><a href="${docs}">All guides</a></p>`)});
}
export const guideNames=guides;
