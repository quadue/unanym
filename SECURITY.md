# Security policy

Unanym is public source and remains a release candidate. No version is currently
designated as a supported production release; no independent security audit or
response-time commitment is claimed.

## Reporting a vulnerability

GitHub private vulnerability reporting was disabled when checked on 2 October
2026. A tested confidential reporting route is an outstanding maintainer task.
Do not assume an ordinary issue, pull request or Telegram discussion is private.

If you already have an agreed private channel with the repository owner, use it.
Otherwise, open an issue at [quadue/unanym](https://github.com/quadue/unanym/issues)
asking the owner for a private security contact, without disclosing the finding.
Wait for that contact before sending exploit details. Do not post credentials,
member records, signing keys, session tokens or a live exploit publicly.

The repository owner is responsible for appointing the security maintainer,
enabling confidential reports, checking notifications and agreeing response
expectations. Update this policy after that route has been tested.
See [GitHub's configuration guide](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

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
