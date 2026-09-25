# Candidate evidence — 2026-09-24

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
