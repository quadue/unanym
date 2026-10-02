# Your Unanym and your places

The community-v1 member interface starts at the private `/account` home, labelled
Your Unanym (or the installation's configured member-facing name). It is the main
private destination. Contextual links under Communities and Websites open the
complete lists. It works with the standalone host and the optional FRRN source.
FRRN continues to own its accounts and approvals; this adds no second approval
store and changes no website identity, consent scope or admission rule.

## Your private member home

The public Create your nym and Sign in links open the account host directly.
A new member enters their email and confirms a code before an account is created.
Returning standalone members can use email codes or an enrolled passkey;
an existing session opens the home without
another code. The new account has no website connections or memberships until
the member connects a website and an organiser separately approves membership.
`/learn` is an explanation of these steps, with no practice account or pretend
permission controls.

The home brings together identity and custody information, current shareable
memberships and confirmations, website connections and the eight most recent
recorded changes. Opening it requires a current member session, is never cached,
and creates no key, connection, permission or history record. Inspecting a record
does not share it. Identity details within each connection show that website's
existing identifier and public key; private keys are never shown.

The home draws the member's communities, identity and website connections using
the public site's dark palette and geometric symbols. It previews at most six
communities and six websites, while the heading counts all active connections.
Larger lists show their total. The links Memberships & confirmations and All
websites remain available under nonempty previews, including shorter lists.
Those complete pages use the same member shell and retain every current record
and registered connection, including stopped connections and sharing controls.
Recent changes open on request; Account keeps custody, recovery and export
information together. Website and record lists are supporting views of this
home, with a link back and a current-page label instead of competing menu entries.

Recent changes also carries an unread count. Mark shown as read works without
JavaScript, preserves new arrivals and affects only this account. All updates
opens a complete list in pages of fifty. Standalone accounts additionally see
passkey changes and approaching/elapsed membership expiry. Reminders refresh
on visits, rather than being sent as mail or push. No third-party contact
permission or website messaging has been added.

Account → Passkeys lets standalone members enroll named keys and remove them
after recent authentication. Passkeys sign into the existing account: they
neither create a new nym for a website nor hold community credentials. Adding
or using a passkey requires JavaScript; email codes and ordinary member controls
remain usable without it. Email is still the fallback recovery method, and
cloud-synced passkeys may involve a provider chosen by the member.

The standalone host shows the member's own sign-in email, email-code recovery
limits and a protected sign-out form. Its organisation activity comes from existing
audit records targeted at that member, with only approved action labels,
organisation names and times. Administrator identities, private authorisation
notes, raw proofs and other members' records are excluded. Organisation tools
appear only for an assigned administrator or the operator.

FRRN-backed hosts retain a link to FRRN's account management and do not read
email into the identity adapter. Their timeline shows only existing Unanym
sharing changes; it does not claim a complete history of community approvals
or website visits. Times are labelled UTC. Current records and past changes
are distinct: an expired or withdrawn record can disappear from available
records while an earlier sharing change remains in history.

This is the hosted community-v1 interface. It does not add the separate wallet
experiment, credential import, personal key custody or automatic recovery.

On Websites, each connected website has its own card and chosen name. Its native expandable
section contains the records currently available under the member's choices,
Change sharing when the site has registered a sharing address, and Disconnect.
Selecting a destination from Memberships opens that particular website card.
These controls work without JavaScript. A site without a sharing address explains
that the member can sign in there again to change their choices.

The member records page lists current shareable memberships and confirmations,
their organisation, dates, and selected destinations. Organisation approval,
operator signature and site admission remain distinct. This is not a global
reputation score or proof of professional training.

## Current information versus previous permission

- The read model uses the same account adapter as issuance. Expired or withdrawn
  evidence cannot appear as currently shared merely because it was selected before.
- Confirmations are not shown as shared with a site that no longer supports them.
- A disconnected card shows the previous name and no current sharing.
- Saved membership choices can become effective again after reapproval. The
  interface and guide explain this; reading the screen never mutates consent.
- These pages describe sharing permission. They do not infer that a website has
  fetched a record or granted access, or promise deletion of previously copied data.
- The operator can link a member's website identities. That remains explicit in
  Privacy & your records and the privacy guide.

The signed per-site history remains available under Connection record. The new
authenticated `/sharing-summary` download is a readable snapshot of the member's
choices, not a root key, credential wallet, recovery kit or website-access proof.
It excludes signing keys, client secrets, sessions and tokens. FRRN-backed hosts
use their configured base path, including `/identity/v1`.

The standalone member home explains email recovery and the current operator-held
keys. It does not claim automatic lost-mailbox recovery or user-held root backups.

## Verification

`tests/member-places.test.js` obtains two real OIDC grants with fictional accounts
and different website hostnames. It checks per-site names and evidence choices,
private routes/export and account isolation, expired/withdrawn projection,
client-disabled confirmations, and disconnection of only one website. The home
checks compare stored identities and permissions before/after reading, show each
website's actual subject, and verify the empty account cannot see another
member's records or activity. Standalone tests check private email and organisation
activity, administrator separation, withdrawal and session-bound sign-out. Browser
checks cover keyboard expansion, destination selection, and widths of 1220, 375
and 320 pixels with scripts disabled. A second fixture holds 14 communities and
14 websites, checks the six-item previews, complete lists and matching palette,
and disconnects a website beyond the preview without changing another connection.
It also checks the home's stacked layout at 860 pixels. Existing tests cover scripted consent.
`tests/public-site.test.js` also follows the public action to a separate standalone
account host with scripts disabled. It verifies account creation only after code
confirmation, no default memberships or connections, and returning to the same
persisted account and session after the service restarts. Email is captured within
that isolated test; the check does not establish external SMTP delivery.

`UNANYM_CAPTURE_DIR=/tmp/member-places node --test tests/member-places.test.js`
also writes desktop and phone screenshots of the fictional authenticated views.
The WordPress simulation remains the actual receiving-site access test. Neither
test establishes real email delivery or unassisted member/operator usability.
