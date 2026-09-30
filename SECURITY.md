# Security policy — release preparation

This is a private release candidate. No version is currently designated as a
supported production release, and no independent security audit is claimed.

## Private reporting

The named security maintainer, private contact channel and response expectations
must be confirmed before public release. They are deliberately not invented in
this draft. During the private review, use the existing private channel agreed
with the repository owner. Do not put credentials, member records, signing keys,
session tokens or a live exploit in an ordinary issue or pull request.

The canonical source is in a private Gitea repository. Ordinary repository issues
are not a confidential reporting channel. Before any public source release,
agree a named security maintainer, private reporting address or channel and
response expectations, then test that channel and replace this preparation text
with the accepted details. Do not assume GitHub-specific reporting facilities
exist on another forge. No new contact address or response commitment is claimed
by this repository migration.

## Review scope

- Account continuity and explicit linking; no implicit matching by email/name.
- Browser-bound email codes, sessions, CSRF, OIDC state/nonce and PKCE.
- Per-website grants, selected memberships, access/refresh revocation and expiry.
- Organisation-admin authority and operator-held signing/database custody.
- WordPress signer pinning, organisation recognition and server-side admission.
- Recovery, backups, issuer/key continuity, deletion and lost-mailbox procedures.

Admin role transfer, lost-mailbox recovery, stronger administrator authentication
and independent key operation need explicit operational acceptance. A dependency's
certification is not certification of this service. Automated fictional tests do
not establish real mail delivery, organisational authority or member usability.
