# Hosted-service risk fixes — 21 October 2026

Candidate: `0.4.0-rc.5`, prepared from `53d5cea` on
`fix/unanym-live-risks-20261021`. No production writes, source publication,
issuer retirement or branch removal were performed.

## Findings checked and changes prepared

- Ordinary WordPress URLs accepted the callback action as a reason to skip
  session validation. The exception is now restricted to Generic Client's AJAX
  endpoint. A copied cookie is rejected after disconnection even with the forged
  action; normal callbacks, explicit linking and native administrator access
  continue to work. The selected private page also has its own membership check;
  skipping session validation does not automatically bypass that second check.
- The request limiter keyed every visitor behind a proxy to its socket address.
  It now uses Express's verified client address and sends `Retry-After` on 429.
  Explicit proxy IP/CIDR configuration supports container and upstream proxies;
  a forged address to the left of an untrusted hop does not change the budget.
- Exact approval and introduction timestamps reached receiving sites in signed
  statements. New statements carry the UTC day in the same v1 date-time shape;
  the source timestamp and expiry remain exact. Dates and other shared facts can
  still correlate people; operator custody is unchanged.
- Email requests invalidated earlier challenges for the address. They no longer
  do. Same-browser repeats resume an unused challenge, without sending more
  mail or extending expiry. Browser binding, one-use and five-attempt limits
  remain. A recipient-wide mail cap can still delay someone who has no issued
  code. This is deliberately not reported as eliminating targeted email denial.
- HTTPS public and identity responses send HSTS. Loopback HTTP stays usable.
- The developer page and webmaster questions no longer say public source is
  private. The public repository still needs synchronising; no publication was
  attempted.

The audit's blanket claim that a 429 logs people out needs a qualification:
UserInfo already returned 503 while preserving the session. Token refresh did
end it on 429; refresh now follows the same temporary-unavailability behaviour.

## Evidence

`npm run verify` passed 51 Node tests and 17 browser checks. The dedicated real
local WordPress 7.1.2 / Generic Client 3.11.3 rehearsal passed 16 checks, including
the copied-cookie case, refresh throttling and two restore/replacement instances.
See [the machine receipt](checks.json) and [WordPress checks](wordpress.json).
Mail was captured, accounts were fictional, and the host replacements occurred
on one workstation. This is software evidence, not real adoption, independent
security review, live email delivery or participant validation.

## Release preparation

1. Reconcile the deployed `53d5cea` ancestry with canonical main before releasing
   this candidate. Preserve existing history; do not fold in unrelated WIP.
2. Configure `IDENTITY_TRUST_PROXY` for the actual reverse-proxy source and every
   trusted upstream hop. Read-only inspection found a container proxy path,
   rather than loopback. Preserve a restricted application listener. Confirm
   separate client budgets and resistance to forged forwarding through the real
   chain; a loopback-only test does not establish the live configuration.
3. Build the package from the reviewed source, record its hash, take a consistent
   backup and preserve issuer, keys, clients, website subjects and consent.
   There is no new database schema. Keep a rollback release and configuration.
4. Deploy the standalone and public services only with owner authorisation.
   Check unauthenticated redirects, real served assets, signing-key continuity,
   HSTS and the currently connected site's sign-in. The WordPress download must
   contain the corrected plugin; distributing it does not update installed sites.
5. Review the FRRN-backed host separately: it uses the same service code but has
   different source bindings. Retiring it or the legacy issuer needs a client
   inventory and explicit migration; it is not part of this fix.

## Privacy notice preparation

The owner supplied Mavie.uk, United Kingdom, 2 South Park Avenue, NR4 7DU and
hello@mavie.uk. These are filled into [the draft](../../privacy-unanym-org.md).
An operator can supply the reviewed notice through
`IDENTITY_PRIVACY_NOTICE_FILE` and `PUBLIC_PRIVACY_NOTICE_FILE`. Sign-in and
public footers open the same text without a session or JavaScript. Another
installation does not automatically identify Mavie.uk as its controller.

Read-only checks confirm Brevo mail, Cloudflare web traffic and backups to R2
and a separate backup server. Backup configuration keeps 7 daily, 4 weekly,
6 monthly and 1 yearly recovery points. That is not a verified fixed erasure
deadline. Before publishing the draft, confirm:

- Hosting provider and location, backup-server operator/location and R2 region.
- Processor contracts, international transfer arrangements and edge analytics.
- A bounded account/audit retention policy, log retention, request handling and
  the maximum backup age, including how restored deletions remain deleted.
- The notice's lawful-basis assessment and any community membership that reveals
  sensitive information. Selecting a claim is not a substitute for that review.

The draft is not enabled by default and was not published. Its structure follows
the [ICO's privacy-information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).

## Separate remaining work

Clock tolerance, forced reauthentication, device-session effects of renewed
consent, key rotation, signup's empty-account journey and redundant issuer
retirement remain outside this candidate. Their audit descriptions have not all
been independently reproduced here. Product differentiation still needs a real
organisation → member → receiving-site trial. Code consolidation alone does not
provide organisation-held signatures or person-held selves.
