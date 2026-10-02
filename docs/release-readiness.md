# Release readiness

The source is public at [quadue/unanym](https://github.com/quadue/unanym).
It remains a release candidate. Source availability, current release publication,
production operation and an international member pilot are separate evidence.

## Included

- Fresh source snapshot with an explicit file inventory and kernel provenance.
- Independent email-code account host and organisation-admin approval.
- Optional browser passkeys for existing standalone accounts, with recent
  authentication for management; email codes remain a fallback.
- Private unread account updates, membership expiry notices and paginated history.
- Neutral, versioned website contract and WordPress companion, including a selectable private member page.
- Optional FRRN account source: one organiser approval, member consent and real local WordPress access tested end to end.
- Fictional local quickstart, automated checks, installation and restore guide.
- Gitea verification workflow with read-only code permissions and pinned actions;
  the GitHub copy is secondary.
- Security reporting policy, compatibility boundary and contributor guidance.
- Concrete fictional choir example and an independent WordPress setup trial
  packet. The packet is prepared, not evidence that a person completed it.

## Public source follow-through

1. Synchronise the reviewed candidate with the existing public history; audit all
   newly exposed commits and preserve dependency/licence attribution.
2. Enable and test a confidential reporting route with the responsible maintainer.
   GitHub private vulnerability reporting was disabled when checked on 2 October 2026.
3. Verify GitHub CI on the exact published revision and state its support boundary.

The [development backlog](roadmap.md) gives these items completion criteria.

Source publication makes the code available under Apache 2.0. It does not certify
an installation or complete the operational acceptance below.

## Before designating a supported production release

Obtain independent review of authentication, disclosure, linking and recovery,
resolve its findings, and agree the maintenance and support commitments.

## Before inviting real members

1. Configure a real operator and prove email delivery to authorised recipients.
2. Record the organisation mandate and appoint its actual administrator.
3. Test the actual WordPress site's admission rules, plugins, cache and account links.
4. Agree account removal, lost-mailbox recovery, admin transfer and retention.
5. Have another responsible operator restore the service; preserve issuer/keys.
6. Run the [WordPress setup trial](wordpress-trial.md) with another person and
   supervised member journeys; record where assistance was needed.

The first community's practice is an acceptance case, not an identity-core rule.
Broader adoption remains unproven until other communities use the service.

## Optional portability work

Keep wallet sign-in, homeserver migration and peer replication outside the first
member journey. The [portability acceptance plan](portability.md) distinguishes
automated local replacement from an independent operator's restore and a future
two-homeserver test. Neither a signature nor a portable storage key alone proves
continuous website accounts, current access or recoverability.

## 0.4.0-rc.1 simulation boundary

The candidate adds a separately chosen community introduction confirmation and
an automated two-WordPress-site rehearsal. It does not make either source public,
register real organisations/sites or establish unassisted usability. Review the
new confirmation authority/disclosure paths with the existing auth review before
public release. Keep the extension disabled for receiving sites until configured.

## 0.4.0-rc.2 member views

The candidate now includes the Your places cards, a member-only view of current
memberships/confirmations and their destinations, and a sharing-summary download.
They report current sharing permission, not receiving-site access. The standalone
account explains its existing recovery boundary; no personal-root recovery or
Pubky migration has been added. Independent review and real-member acceptance
remain required. See [the member interface](member-places.md).

## 0.4.0-rc.4 passkeys and private updates

Virtual-authenticator tests exercise enrollment, sign-in, credential ownership,
origin/RP/user-verification checks, stale sessions, challenge replay/expiry,
removal and backup/restore while preserving website identities. Account updates
exercise expiry, renewal, per-member read state, unseen arrivals, pagination,
mobile widths and no-JavaScript operation. These are automated fictional checks.
Test physical phones/security keys and recovery in the independent pilot, and
include the new WebAuthn paths in the external authentication review. Passkeys
are optional sign-in, not enforced stronger administrator authentication or a
credential wallet. No website messaging or external notification dispatch ships.
