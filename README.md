# Unanym

**Independent identity for community websites.**

Let members sign in, choose a name for each website, and share only the
memberships they select. Each website keeps its own accounts and admission rules.

Run Unanym on your own domain, with your own operator and branding. It supplies
accounts, organisation approvals and member-controlled sharing independently
of any community platform. Membership rules belong to your community.

**Status: release candidate.** WordPress is the tested integration.
Real member acceptance and an independent security review are still pending.
The source is public under Apache 2.0 and the local tests support evaluation; this is not yet a
supported production release.

## Try it locally

Install Node.js 24 and npm, then clone the public repository:

```sh
git clone https://github.com/quadue/unanym.git
cd unanym
npm run quickstart
```

Open `http://localhost:4080/identity/example/`, a receiving website registered
like any other, and choose **Continue with Unanym**. Sign in as Robin (two approved
memberships) or Sam (none), choose what to share, and the example shows exactly
what arrived and verifies its signatures. The developer overview and guides are at
`http://localhost:4080/identity/developers`. This uses the v1 contract with
fictional accounts; it sends no email and reads no community database.
Stop it with Ctrl+C. It writes only to ignored `data/demo-v1/`. Use
`UNANYM_DEMO_PORT` if port 4080 is occupied. The legacy compatibility fixture
remains available as `npm run demo:independent`.

## Simulate two connected websites

The [two-site rehearsal](docs/two-site-simulation.md) runs a fictional FRRN
community and two real local WordPress sites, including independent choices and
withdrawal. The candidate also supports one [optional confirmation](docs/contracts/confirmations-v1.md):
a community organiser records that its introduction was completed. This is
separate from membership and is shared only when selected.

## Manage your sharing

**Your Unanym** is the private member home at `/identity/account`. It brings
together your identity, current community records, website connections and
recent sharing changes. The standalone host also shows your private sign-in
email, recovery information and organisation updates. A FRRN-backed installation
uses its own member-facing name and keeps account management with FRRN.
The home previews up to six communities and six websites. Its contextual links
open All websites or Memberships & confirmations, which share its dark style.
Recent changes are expandable. Complete lists remain available without separate
primary navigation entries.

**Websites** gives each connected website a card with its chosen name and
sharing controls. **Memberships & confirmations** shows current records and
where they are shared. Members can download a readable summary of their choices;
this is not a key backup or proof of website access. The views work without
JavaScript. See [member views and their boundaries](docs/member-places.md).

## Run your own identity service

The standalone host has persistent email-code accounts, organisation-specific
administrators, membership approval/revocation, per-website consent, and backup
and restore. Supply your own HTTPS origin, SMTP transport and bootstrap email:

```sh
npm ci
npm run build
# Configure the operator settings described in docs/standalone.md.
npm start
```

There is no default administrator account, password or production client
registration. See [installation and operations](docs/standalone.md). The
`clients.json` in this repository is deliberately empty.

## Connect WordPress

Install OpenID Connect Generic Client and the companion built at
`dist/wordpress.zip` on a staging site. Register its exact callback with your
operator, configure the connection and select the organisations your site
recognises. Existing members explicitly link from their WordPress profile.
Accounts are never merged by name or email.

For a simple member area, create a private WordPress page and select it with
its required organisation under **Settings → Unanym**. Members choose to share
that membership and the page checks current approval on every request. This
needs no site-specific PHP. Existing content plugins and uploaded files need
their own access policy.
[Setup](docs/standalone.md#wordpress) · [Webmaster questions](docs/webmaster-questions.md) · [Compatibility](docs/compatibility.md)

## Use FRRN as the membership source

When running alongside FRRN, use `npm run start:frrn`. FRRN holds the account and
organiser's approval; Unanym reads it and handles per-website disclosure. There
is no second member account or approval list. The default standalone installation
continues to work without FRRN. [Authority and setup](docs/frrn-host.md).

## What the proof means

An operator-signed membership statement says that an assigned organisation
administrator approved that membership. It identifies the organisation, signer,
receiving website and expiry. It does not prove training or personal safety.

The operator holds the database and signing keys and can link website identities.
Receiving websites get separate identifiers, chosen names and selected
memberships, without account email. Shared names can still make someone
recognisable. Disconnecting stops future access, not copies already received.

[Identity v1 contract](docs/contracts/community-v1.md) ·
[Security and support boundary](SECURITY.md)

Optional Pubky Ring sign-in and organisation-held signing keys are distinct
future adapters. This release does not implement them or require a wallet.
The [portability design and acceptance plan](docs/portability.md) keeps storage
choice separate from website accounts, consent and organisational authority.

## Public website

`npm run start:site` serves the independent Unanym overview, guides, getting-started
explanation and WordPress download at port 4386. Create your nym and Sign in
lead to the account host at `https://unanym.org/identity/account` by default.
Set `PUBLIC_ACCOUNT_URL` to use another account host; HTTPS is required except
for loopback development. Set `PUBLIC_ORIGIN`, `HOST` and `PORT` for deployment.
Build assets first with `npm run build`. This entry
point is documentation only: it opens no account database and has no sign-in or
issuer endpoints. The public site can move domains without migrating accounts.

`PUBLIC_COMMUNITY_URL` adds a Telegram discussion link in a small community
section at the bottom of the landing. `PUBLIC_SOURCE_URL` adds the public GitHub
source link there, in the footer and in the operator guide. Both require HTTPS;
leave either unset until its destination is available. These are ordinary links,
with no embedded chat widget or third-party scripts.

Visitors can join [Unanym Community](https://t.me/unanymcommunity) to ask questions
and share feedback. Joining the chat is separate from creating an account or
receiving a community membership. Read [the security reporting policy](SECURITY.md)
before reporting a suspected vulnerability.

The account host creates a persistent account only after an email code is
verified. The same flow signs returning members into their existing account;
members already signed in go straight to their private home. Creating an
account grants no memberships and connects no websites. `/learn` explains this
flow without creating a practice identity or simulating sharing controls.
The public landing has two navigation choices: How it works and Sign in.
`/learn` is the shared explanation, with three illustrated steps and expandable
questions. `/overview` and `/docs/members` redirect there, retaining incoming
links. Website connection and technical documentation are separate contextual
destinations rather than extra member onboarding pages.
The standalone host's `/` and `/identity/` entry points open the private home,
offering email-code sign-in when the member is signed out. Returning standalone
members can also use a previously enrolled browser passkey. Passkey management
is available under Account on the private home; it requires a sign-in within
the last ten minutes and preserves the existing account and website identifiers.
Email-code sign-in remains available, including without JavaScript.

Recent changes now shows unread approvals, withdrawals, confirmations, sharing
changes and passkey changes. Standalone members also see a reminder within seven
days of membership expiry and a notice after expiry. Members can mark the shown
updates as read and open a paginated complete list. These are private account
updates, not external email/push notifications or messages from websites.

## Development

External contributors can use [GitHub](https://github.com/quadue/unanym) for
issues and pull requests. Maintainers keep the canonical release source in
Gitea and carry reviewed changes between the two repositories. Each forge has
a pinned verification workflow. Passing CI does not deploy the public site or
an identity service. See [repository and release workflow](docs/repository.md)
and the [ordered development backlog](docs/roadmap.md).

```sh
npm ci
npx playwright install chromium
npm run verify
```

Node tests exercise real browser consent, email-code accounts with captured mail,
organisation isolation, signature verification, withdrawal and recovery. Chromium
tests cover the example and consent UI. PHP with Sodium, or Docker, is needed for
the cross-language test. The separate WordPress rehearsal is documented in
[the operator guide](docs/standalone.md#reproduce-acceptance).

Compatibility fixtures retain the old host's wire formats for regression tests;
they are not a requirement to operate the standalone service. `npm run
start:legacy` is a separately configured adapter entry point, not the default.

## Source and licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for inherited kernel and
third-party attribution. `SOURCE_SNAPSHOT.json` records the reviewed initial
snapshot, with file hashes and the upstream revision; private history and runtime
data are excluded. Later commits retain their own Git history normally.
The [dependency inventory](docs/dependencies.json) records locked versions and
their package-declared licences for review.

See [contributing](CONTRIBUTING.md) and [release readiness](docs/release-readiness.md).

For independent setup acceptance, use the [WordPress staging trial](docs/wordpress-trial.md)
and [blank report](docs/templates/wordpress-trial-report.md). The trial is prepared;
it has not been completed by an independent tester.
