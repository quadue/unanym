import {escape} from './views.js';
import {displayName,learnArt,memberAccountURL,memberPage} from './presentation.js';

export function learnView(config) {
  const brand=escape(displayName(config)),base=config.basePath??'/identity',pictures=learnArt();
  const account=escape(memberAccountURL(config)),hosted=config.contract==='community-v1'&&config.accountSource!=='frrn';
  return memberPage(config,'How it works',`<div class="learn member-learn">
    <section class="learn-intro"><h1>How ${brand} works</h1><p>One account. You choose what each website sees.</p>
      <div class="landing-actions"><a class="pill accent" href="${account}">${hosted?'Create your '+brand:'Your '+brand+' account'}</a></div></section>
    <section aria-label="How it works"><div class="learn-cards">
      <article>${pictures[0]}<span class="learn-number">1</span><h2>${hosted?'Create your account':'Sign in'}</h2><p>${hosted?'Confirm a code sent to your email.':'Use your existing account.'} Creating an account connects no websites and grants no memberships.</p></article>
      <article>${pictures[1]}<span class="learn-number">2</span><h2>Choose what to share</h2><p>On a website, choose Continue with ${brand}. Pick a name and any memberships to share. Your email stays with your account.</p></article>
      <article>${pictures[2]}<span class="learn-number">3</span><h2>Review or disconnect</h2><p>Your ${brand} shows what each website receives. Change your choices or disconnect.</p></article>
    </div></section>
    <section class="learn-questions" aria-labelledby="questions-heading"><h2 id="questions-heading">Questions</h2>
      <details id="sharing"><summary>What can a website see?</summary><p>Your chosen name, its own identifier for you, and the memberships or confirmations you select. It receives no account email, other connections or unselected memberships.</p><p>Each website decides what access your shared records allow. Sharing permission does not mean a website fetched the records or admitted you.</p></details>
      <details id="memberships"><summary>How do I get a membership?</summary><p>An authorised organiser approves it. Creating an account does not make you a member. A confirmation records completion of a community introduction and is shared separately.</p><p>Approvals can expire or be withdrawn. Saved sharing choices can apply again after reapproval; review them if you no longer want to share. Membership and introduction confirmations do not certify professional training or personal safety.</p></details>
      <details id="disconnect"><summary>What happens when I disconnect?</summary><p>New access through this service stops. Previously issued sign-in tokens expire within five minutes. Websites may keep earlier copies.</p><p>In Your ${brand}, use a website's Change link to review sharing. If it has no Change link, sign in on that website again.</p></details>
      <details id="privacy-details"><summary>Who can connect my identities?</summary><p id="privacy"><span id="who-can-connect-the-dots"></span>Your account operator holds the records and signing keys and can link your websites. Each website gets a different identifier, but shared names and memberships can still make you recognisable.</p><p>A website receives operator-signed approval statements. Organisation approval and operator key custody are different; the organisation does not hold those signing keys.</p></details>
      <details id="recovery"><summary>How do I recover my account?</summary><p>${hosted?'Sign in with a code sent to your email. If you lose access to that mailbox, contact your account operator. Automatic lost-mailbox recovery is not available.':'Your account provider handles sign-in and recovery.'}</p><p>Your sharing summary is a copy of your choices, not a key backup or recovery kit.</p></details>
      <details id="community-tools"><summary>Do you run a website or community?</summary><p><a href="${escape(config.publicDocs?'/developers':base+'/developers')}">Connect a website</a> · <a href="${base}/docs/organisers">Approve members</a> · <a href="${base}/docs/operators">Run an identity service</a></p></details>
    </section>
  </div>`,{access:true,current:'learn'});
}
