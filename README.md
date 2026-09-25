# Unanym

**Independent identity for community websites.**

Let members sign in, choose a name for each website, and share only the
memberships they select. Each website keeps its own accounts and admission rules.

Unanym is the identity component behind FRRN, but runs on its own. You can use
your own domain, operator and branding without a FRRN account or community
database. Membership rules belong to your community.

**Status: private release candidate.** WordPress is the tested integration.
Real member acceptance and an independent security review are still pending.
The source and local tests are available for evaluation; this is not yet a
supported production release.

## Try it locally

Install Node.js 24 and npm, then run from this checkout:

```sh
npm run quickstart
```

Open `http://localhost:4080/identity/example/`, a receiving website registered
like any other, and choose **Continue with FRRN**. Sign in as Robin (two approved
memberships) or Sam (none), choose what to share, and the example shows exactly
what arrived and verifies its signatures. The developer overview and guides are at
`http://localhost:4080/identity/developers`. This uses the v1 contract with
fictional accounts; it sends no email and reads no community database.
Stop it with Ctrl+C. It writes only to ignored `data/demo-v1/`. Use
`UNANYM_DEMO_PORT` if port 4080 is occupied. The legacy compatibility fixture
remains available as `npm run demo:independent`.

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
[Setup](docs/standalone.md#wordpress) · [Compatibility](docs/compatibility.md)

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

## Development

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
