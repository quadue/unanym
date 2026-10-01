import {escape} from './views.js';
import {displayName,learnArt,memberAccountURL,memberPage} from './presentation.js';

// Reading this page never creates an account or changes sharing permission.
export function learnView(config) {
  const brand=escape(displayName(config)),base=config.basePath??'/identity',pictures=learnArt();
  const account=escape(memberAccountURL(config)),hosted=config.contract==='community-v1'&&config.accountSource!=='frrn';
  return memberPage(config,'Getting started',`<div class="learn member-learn" data-brand="${brand}">
    <section class="learn-intro"><h1>One you.<br>Start here.</h1><p>${brand} holds your account. You choose what each website sees.</p>
      <div class="landing-actions"><a class="pill accent" href="${account}">${hosted?'Create your '+brand:'Your '+brand+' account'}</a></div>
      <p class="learn-small">${hosted?'Confirm a code sent to your email. If you already have an account, the same code signs you in.':'Use your existing account to sign in.'}</p></section>
    <section aria-label="How it works" class="visual-story"><div class="learn-cards">
      <article data-scene="0">${pictures[0]}<span class="learn-number">1</span><h2>${hosted?'Create your account':'Sign in'}</h2><p>${hosted?'Enter your email and confirm the code. Your account starts with no websites connected.':'Sign in through '+brand+'.'} Each community keeps its own website and rules.</p></article>
      <article data-scene="1">${pictures[1]}<span class="learn-number">2</span><h2>Choose what to share</h2><p>On a participating website, choose Continue with ${brand}. Pick a name and any memberships you want to share. The website receives no email address from ${brand}.</p></article>
      <article data-scene="2">${pictures[2]}<span class="learn-number">3</span><h2>Review your connections</h2><p>Your ${brand} shows your communities and what each website receives. Change your choices or disconnect to stop new access through this service.</p></article>
    </div><div id="animation-controls" class="actions" hidden><button class="pill" id="watch-story">Watch the steps</button><button class="pill" id="next-scene">Next illustration</button><span id="story-caption" role="status">Read at your own pace, or watch the three steps.</span></div></section>
    <section class="learn-boundaries"><h2>Your account, your choices</h2>
      <p>You can create an account before connecting a website or joining a community. An organiser approves a membership; creating your account does not grant one.</p>
      <p>Use a first name or pseudonym for each website. Your email stays with the account service. Shared names or memberships can still make you recognisable.</p>
      <p>The operator holds the records and signing keys and can link your connections. Disconnecting stops new access; websites may keep earlier copies. Membership does not certify training or safety.</p>
      <a href="${base}/${config.publicDocs?'docs/members':'about'}">Read how your information is handled →</a></section>
  </div><script type="module" src="${base}/assets/learn.js"></script>`,{access:true});
}
