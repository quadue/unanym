# Candidate evidence — 2026-09-24

## 0.4.0-rc.6 — explicit email-code resend — prepared 2026-10-21

The sign-in and account-confirmation code screens gain **Send another code**.
It sends a fresh code without cancelling earlier emails, extending the request
or resetting its five guesses. Accepting any code consumes the whole request.
Two additional sends are allowed per request, at least a minute apart, within
the existing six-email recipient cap. A delivery failure preserves the earlier
code. Email names the request's actual expiry.

Only HMACs of additional codes are stored in the additive `challenge_resends`
table; no readable or recoverable code is added to storage. Used extra digests
are removed immediately; expired ones follow challenge cleanup. Existing
requests remain usable after the table is introduced. Recipient-wide quota abuse
before a first code is issued remains possible; this improves retrying delivery.
The deployed rc.5 release and the public-source/privacy follow-up remain separate.

## 0.4.0-rc.5 — hosted-service risk fixes — 2026-10-21

Prepared from the deployed rc.4 source. Ordinary WordPress URLs can no longer
skip connection validation by carrying the OpenID callback action. The real
Generic Client AJAX callback remains available. A rate-limited refresh now
returns temporary unavailability while preserving the session, matching the
existing UserInfo failure behaviour.

Service request limits use the verified visitor address. Container and upstream
proxies require an explicit trusted-address configuration; the default stays
loopback. New membership and introduction statements disclose the UTC approval
or confirmation day while the private source keeps its exact timestamp. The v1
claim shapes, issuer, signing keys, subjects and expiry enforcement are retained.
This removes one timestamp fingerprint, not every possible cross-site inference.

Requesting an email code no longer cancels another browser's issued code.
Same-browser repeats reuse a live challenge without another message or a renewed
expiry. Recipient mail throttling can still delay a sign-in that has no issued
code; this is a bounded mitigation, not a claim of eliminating targeted denial.
HTTPS installations send HSTS. Local HTTP fixtures remain usable.

The public documentation no longer says the source is private. Synchronising
the public repository with deployed source is separate work. Both front doors
can serve an operator-supplied privacy notice; the Mavie.uk draft records the
owner-provided contact and remaining operational facts to settle before approval.
No production change or issuer consolidation is made by this candidate.

## 0.4.0-rc.4 — passkeys and private account updates — 2026-10-02

Standalone members can enroll and name up to ten browser passkeys after recent
authentication, then sign into their existing account without requesting an
email code. Management of an older session requires confirmation with that
account's passkey or a code sent to its current email. Website subjects, keys,
approvals and consent are preserved.
Email fallback remains available; this is not enforced two-factor authentication
or a credential wallet. Removing a passkey prevents new sign-ins with that key
and preserves existing sessions until sign-out or expiry.

Recent changes now has private unread state, read controls and a complete list
in pages of fifty. Mark shown as read acknowledges only the displayed IDs for
that member, preserving later arrivals. Standalone accounts also see impending
and elapsed membership expiry, renewal and passkey changes. Read markers and
passkey public records are included in the ordinary consistent backup. Notices
refresh on visits; no external email/push dispatch or website messaging is added.

Virtual-authenticator tests exercise the bundled browser SDK and actual signed
WebAuthn ceremonies, enrollment/sign-in/removal, fresh-auth requirements,
credential ownership, changed origins/RP/user handles, missing user verification,
invalid signatures, challenge replay/expiry/browser binding, and backup/restore
with existing persona continuity. Update tests cover expiry, renewal, account
isolation, unseen arrivals, pagination and no-JavaScript operation. Physical
phones/security keys, independent security review and real-member acceptance
remain separate release gates.

Local `npm run verify` passed 44 Node tests and 17 Chromium tests on Node
24.11.0 / Chromium 153.0.8010.12. `npm audit --omit=dev` reported no known
runtime vulnerabilities on 2 October 2026. The [account-flow evidence](evidence/account-passkeys-updates.json)
records the fictional test boundary; these results do not establish physical
device compatibility, live email delivery or independent security acceptance.

## Public contribution and remaining work — 2026-10-02

The repository instructions now point external contributors to the existing
public GitHub repository. The ordered backlog has completion criteria for
source synchronisation, confidential security reporting, an independent
WordPress trial, account lifecycle and operational acceptance. The security
policy records the reporting gap rather than promising an unconfigured route.

Community-v1 consent, organisation administration, privacy and rendered errors
now use the private member home's dark shell and compact navigation. Existing
form actions, consent choices and permissions remain unchanged; legacy adapters
retain their presentation. The standalone test completes member login and
consent without JavaScript, checks registration, administration and consent at
320, 375 and 1280 pixels, then verifies signed claims, withdrawal and restore.

Local verification passed 40 Node tests and 17 Chromium tests. These are fictional
software checks, not independent human acceptance, live mail proof or a security
audit. Public source revision and production deployment are recorded separately.

## Community links — 2026-10-01

The public landing can link to a Telegram discussion and a public GitHub source
repository through `PUBLIC_COMMUNITY_URL` and `PUBLIC_SOURCE_URL`. Links appear
only when configured; there is no chat embed or external script. The main account
action and navigation remain the same. The opening sentence now explains that
one account connects community websites and the member chooses what each sees.
Source publication and the remaining security and operational acceptance are
tracked separately in the release-readiness document.

## Member entry update — 2026-10-01

The presentation now has a short public landing, one How it works page and the
private Your Unanym home. Old `/overview` and public `/docs/members` links redirect
to `/learn`. Privacy and membership questions expand on request without scripts.
The private home links to complete website and record lists from their respective
sections; Recent changes is expandable. Website setup keeps screenshots and
protocol reference behind descriptive controls. Technical documentation and
the original authenticated URLs remain available.

The public landing and overview lead directly to Create your nym or Sign in.
`/learn` now explains account creation and selective sharing without a fictional
practice account. The public service links to the separately hosted account
service; `PUBLIC_ACCOUNT_URL` can select that host. Email-code screens use the
private member home's visual style. The first verified code creates a persistent
account, and an existing session opens the member home directly. Accounts start
with no website connections or memberships. Issuers, per-website identities and
sharing permissions are unchanged. This presentation change does not establish
completion of the acceptance items in the release-readiness document.

## 0.4.0-rc.3 — independent Unanym presentation

Standalone installations and the WordPress fallback now use Unanym by default.
Explicit operator branding still applies. The public documentation site is a
separate read-only service: it opens no identity database and creates no member
accounts. Its initial presentation included a fictional practice flow; the
1 October member entry update replaced that with real account creation and `/learn`.
Webmaster questions remain available.
FRRN remains an optional account-source integration; its host selects its own
brand explicitly. Issuers, scopes, account mappings and existing approvals are
unchanged. The public site can move domains independently of sign-in services.


This is a fresh, private source candidate. `SOURCE_SNAPSHOT.json` identifies its
upstream revision and file hashes. The private project's operational history and
community material are not part of this repository.

The exported candidate passed **18 Node tests and 17 Chromium tests** locally,
including standalone email-code accounts with captured mail, organisation
isolation, OIDC consent, signature verification, disclosure/withdrawal and backup
restore. The one-command quickstart was exercised from a fresh dependency install.
It uses fictional accounts and the independent fixture adapter, not real email.

The retained WordPress companion previously passed 11 synthetic checks in a local
WordPress 7.1.2 / PHP 8.3 / Generic Client 3.11.3 installation. The rehearsal can
be reproduced using `docs/standalone.md`; this does not validate every receiving
site's plugins or content rules. Its operator-held-key custody is unchanged.

The source export retains all pinned kernel bytes, licence and provenance. No
existing production issuer, account mapping or client registration was migrated.
`npm audit --omit=dev` reported no known runtime vulnerabilities at preparation;
that registry result is time-specific and is not an independent security review.

GitHub CI, external review and real operator/member acceptance are distinct from
these local results. See `docs/release-readiness.md` for the remaining gates.

## Parallel FRRN issuer candidate — 2026-09-25

The optional FRRN host supports `/identity/v1` alongside an unchanged legacy
issuer. It preserves same-host sign-in and pins each installation to its original
issuer path, keys and FRRN database instance. Versioned consent, assets, discovery
and WordPress registration preparation use the same configured path.

The release checks, 21 Node tests and 17 browser tests passed. A real local
WordPress rehearsal at the versioned path passed all nine approval, consent,
private-page, withdrawal and administrator-access checks using isolated fictional
accounts. The optional v1 WordPress download is operator-enabled; legacy and HTML
starters remain gated. This is software acceptance, not real-member adoption or
an independent security review.

## 0.3.0 developer overview and guides — 2026-09-25

The developer overview now shows the organiser → member → website journey with
screenshots of fictional data, a hosted example website, a versioned WordPress
download and guides for organisers, members, website owners and operators.
Reference documents render as HTML; their plain-text versions remain.

- **Example website.** An operator can register a client whose only redirect is
  `<issuer path>/example/callback`. The service then offers a receiving site that
  uses authorization code + S256 PKCE, verifies the ID token and each membership
  statement, reads current UserInfo and stores nothing. Without that registration
  nothing is mounted. The legacy browser example is unchanged.
- **Reproducible package.** The WordPress ZIP uses a fixed timestamp, so its
  SHA-256 in `dist/release.json` can be rebuilt from source. The overview shows
  it with the version and the recorded WordPress/Generic Client test versions.
- **Local quickstart** now runs the v1 contract with the example website
  (`npm run demo:v1`). `scripts/capture-screens.js` regenerates the screenshots.
- The contract gains the conditions for replacing the OIDC engine. The FRRN host
  guide reflects that a community's only organiser can approve themselves.

No wire contract, claim, scope, key or account mapping changed. New Node tests
cover the renderer's escaping, every guide and reference route, and a browser run
of the example (consent, verified claims, refusal of a reused or forged callback,
and a declined change). This is software acceptance with fictional accounts.

## 0.3.1 developer starting paths — 2026-09-25

The overview now leads with member-controlled names and membership sharing, with
immediate routes to the example, WordPress setup and independent hosting. The
existing four screenshots and installation-specific guides remain. The Unanym
wordmark returns to its own overview.

Guides have section links that work without JavaScript. Commands and the download
checksum have copy controls, with text selection if the clipboard is unavailable.
Member guidance explains why an approved membership might not be available, and
the example explains that its identity service still records sharing choices.
The contract states explicitly that the operator can link website identities.

Only the companion's package version and bundled documentation change; WordPress
access logic, authentication, account mappings and the membership contract format
are unchanged.

Validation: 26 Node tests and 17 Chromium tests passed, plus the nine-check
FRRN-to-WordPress rehearsal with fictional accounts. Portal checks include
320px layouts, guide links without JavaScript, exact clipboard copying and its
selection fallback. The mobile contents adjustment passed the portal checks
again after the full suite.

## Unreleased — portability boundary and service replacement rehearsal

The architecture keeps Pubky optional and ordinary WordPress sign-in independent
of storage or peer networking. It distinguishes member-controlled keys, operator
custody, organisation authority, contextual identities and current access. It
does not promise deletion of a recipient's saved plaintext or keys.

The standalone WordPress rehearsal now restores the service into a new directory
with the old path retired, reloads configuration and keys from the restored files,
and preserves the same website account, name, choices and actual private page.
A changed issuer is refused. Withdrawal still closes the page; a second restore
after disconnection keeps the old refresh token invalid while another member's
connection remains usable. All fourteen checks passed with fictional accounts
and captured mail. The script refuses a lab mounted from another plugin checkout.
The release checks, build, 26 Node tests and 17 Chromium tests also passed.

This is a same-workstation service replacement test, not a physical host move,
an independent operator's recovery, a Pubky integration or real-member acceptance.
No authentication logic, wire format, live issuer or member data changed.
The [portability plan](portability.md) records the separate two-homeserver gate.

## 0.4.0-rc.1 — separate confirmations and two websites — 2026-09-25

Unreleased candidate. A community organiser can separately confirm completion
of its introduction. The standalone account host and the optional FRRN source
both support it. Each receiving client must opt in, and each member chooses
whether to share the confirmation. The signed type is separate from membership;
WordPress checks and displays it without granting a new role or qualification.

A direct Change sharing action returns to the website's consent choices. The
consent screen names its recipient before the choices, uses shorter main copy,
and puts signing details in a native expandable disclosure. Phone and desktop
screens were inspected using fictional accounts.

Local verification passed 29 Node tests and 17 browser tests in Unanym, and 120
Node tests plus both community browser journeys in FRRN. Additional targeted
browser verification covered expanding the explanation and rejecting a forged
or client-disabled confirmation selection. Two actual local WordPress sites
passed 14 approval/disclosure/withdrawal checks; the independent standalone
rehearsal passed 14 checks including two service restores with confirmation and
sharing state. See `docs/evidence/two-wordpress-sites.json` and
`docs/evidence/standalone-confirmation-restore.json`.

These are synthetic software results, not independent human acceptance or real
mail delivery. The runner uses isolated fictional databases. No live source or
client was registered, no production deployment changed, and no public GitHub
release was made. The existing independent-review and member-trial gates remain.

## 0.4.0-rc.2 member places — 2026-09-25

Connected websites now have individual cards containing their chosen names and
sharing controls. A separate member view shows current memberships and community
confirmations, their organisation and where they are shared. Choosing a destination
opens that website's card. Unavailable records and disconnected websites are not
presented as continuing sharing. The signed permission history stays available.

The member can download a readable sharing summary without keys, tokens or client
secrets. It is not a key backup or an account-recovery kit. The standalone account
now explains email recovery and operator-held keys. The guides and fictional
walkthrough screenshots follow the new interface. The quickstart example has a
direct Change sharing link.

Local verification passed 31 Node tests and 17 browser tests. The new test obtains
two OIDC grants and checks account isolation, private exports, current evidence,
client-disabled confirmations and one-site withdrawal. Keyboard and phone checks
work without scripts. The two actual local WordPress sites passed all 14 checks;
the runner now waits for the database after restarting an existing lab.
See `docs/evidence/member-places-wordpress.json`.

These remain fictional software simulations. They do not establish real-member
usability, email delivery or independent operational acceptance. Production and
the public repository have not been changed by this candidate.
