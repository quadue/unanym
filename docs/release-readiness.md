# Release readiness

This repository is a private candidate for review. Preparing source for GitHub
does not declare a production release or complete an international member pilot.

## Included

- Fresh source snapshot with an explicit file inventory and kernel provenance.
- Independent email-code account host and organisation-admin approval.
- Neutral, versioned website contract and WordPress companion, including a selectable private member page.
- Optional FRRN account source: one organiser approval, member consent and real local WordPress access tested end to end.
- Fictional local quickstart, automated checks, installation and restore guide.
- GitHub verification workflow with read-only permissions and pinned actions.
- Draft security policy, compatibility boundary and contributor guidance.

## Before public release

1. Confirm the named maintainer, private reporting channel and support scope.
2. Review this snapshot and dependency/licence inventory; preserve attribution.
3. Obtain independent review of authentication, disclosure, linking and recovery.
4. Confirm the public repository/name and enable private vulnerability reporting.
5. Verify CI on the exact candidate and document the release's supported boundary.

## Before inviting real members

1. Configure a real operator and prove email delivery to authorised recipients.
2. Record the organisation mandate and appoint its actual administrator.
3. Test the actual WordPress site's admission rules, plugins, cache and account links.
4. Agree account removal, lost-mailbox recovery, admin transfer and retention.
5. Have another responsible operator restore the service; preserve issuer/keys.
6. Run supervised member journeys and record where assistance was needed.

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

## Wallet experiment boundary

`exp/wallet-bridge` remains unreleased and is not mounted by the ordinary hosts.
Its receiver extension requires operator enablement, a website request and member
consent. The browser-bound completion and bounded status checks need independent
review; actual wallet UX, other implementations and HTTPS remain untested. Do not
enable cross-device completion by removing the binding checks. The latest evidence
and protocol limitations are in [the experiment](wallet-experiment.md).
