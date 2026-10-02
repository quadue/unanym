# Development backlog

This is an ordered backlog, not a promise of dates or supported features.
The [release checklist](release-readiness.md) tracks acceptance; completed
participant reports belong outside the public repository.

## Current foundation

Unanym has persistent browser accounts, organisation approvals, optional
introduction confirmations, per-website names and identifiers, selective sharing,
withdrawal and a WordPress integration. The operator holds records and keys.
The private home brings together what the member holds and where it is shared.
These records are not a self-custodied credential wallet.
Standalone members can enroll optional passkeys. Private account updates have
unread state, expiry notices and complete paginated history; they do not provide
external push delivery or permission for websites to contact a member.

## 1. Publish the current candidate and establish security reporting

The public repository exists. Bring its code up to the reviewed candidate while
preserving its history, and make external contribution instructions usable.

Done when all newly exposed history has been reviewed, a clean public clone runs
the documented quickstart, GitHub Verify passes on the exact published revision,
and a confidential security report reaches an appointed maintainer. Record source
and deployment revisions separately. See [repository workflow](repository.md)
and [SECURITY.md](../SECURITY.md).

## 2. Complete an independent WordPress trial

Use two staging websites and one selected issuer. Appoint the actual organisation
administrator and arrange authorised test inboxes and consenting participants.
Start with the [trial packet](wordpress-trial.md); the existing fictional
two-site rehearsal is a baseline, not a completed human trial.

Done when another person can configure a site and members can receive email,
create an account, explicitly link an existing website account, choose different
sharing on each site, change it and disconnect. Verify withdrawal, expiry, caches,
issuer outage and native administrator access on those actual installations.
Record assistance and failures privately. Do not infer international demand from
one successful installation.

## 3. Resolve account lifecycle and administrator continuity

Define lost-mailbox recovery, email changes, account removal, retention and
organisation administrator transfer before adding their controls. Specify who
may authorise each action, how they prove that authority, and what records remain.
Email similarity or a matching display name must never link accounts.

Done when reviewed procedures have been exercised in staging, sessions and grants
are withdrawn as intended, issuer/subject mappings survive permitted changes,
and backups and receiving-site retention are accurately explained. Stronger
administrator authentication is part of the security review, with ordinary
browser access retained for members.

## 4. Finish the member and operator journeys

Keep the public entry, explanation, private home, consent, administration,
privacy and error pages visually consistent. Complete lists should remain
contextual destinations. Keep optional protocol and custody explanations behind
descriptive disclosures without hiding the recipient or the actual choice.

Done when keyboard and phone journeys work, long names and lists remain usable,
and account creation, consent refusal, approval, withdrawal and error recovery
remain understandable without JavaScript. Use the independent trial to decide
whether invitations or simpler operator onboarding are needed.

## 5. Establish operational acceptance

Have another responsible operator restore an installation from its backup on a
separate host. Preserve the issuer, keys, website account mappings and withdrawn
permissions. Agree monitoring, mail delivery checks, retention, support ownership
and a rollback procedure. Resolve independent auth/consent/recovery review findings.

Done when that operator completes and records the restore and the agreed failure
procedures. CI, a healthy process and an HTTP response do not establish this.
See [installation and operations](standalone.md) and [portability](portability.md).

## Bounded experiments after the trial

- **Credential interoperability:** an independent issuer, a compatible wallet,
  Unanym and two WordPress sites using one agreed issuance/presentation profile.
  Preserve existing website accounts and test holder binding, expiry, status
  freshness, replay, withdrawal bounds and wallet replacement. A local prototype
  or operator-issued JWT does not establish standards interoperability or privacy
  from the Unanym operator. Wallet use must remain optional.
- **Organisation-held signing:** enrolment, key custody, rotation and withdrawal
  with an organisation actually operating its key. The existing contract's
  signing modes do not establish that operational capability.
- **Optional storage and Pubky:** a two-homeserver migration and recovery trial
  preserving website identities and consent. Storage portability alone is not
  account recovery or credential custody.
- **FRRN and Pactloom connections:** deliberate linking with proof of both
  accounts and a versioned read-only approval source. FRRN retains authority over
  its approvals; keep coordination activity separate from identity disclosure.
- **Scoped attestations:** explore a specific organisation's claim with an issuer,
  subject, context, expiry and withdrawal rule. Start with an evidenced use case
  before extending the vocabulary or adding broad reputation scores.

Each experiment needs its own isolated environment and acceptance criteria
before it becomes a release commitment.
