# Your places

The community-v1 member interface has three entries: Your places, Memberships,
and Your account. It works with the standalone host and the optional FRRN source.
FRRN continues to own its accounts and approvals; this adds no second approval
store and changes no website identity, consent scope or admission rule.

Each connected website has its own card and chosen name. Its native expandable
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

The standalone account page explains email recovery and the current operator-held
keys. It does not claim automatic lost-mailbox recovery or user-held root backups.

## Verification

`tests/member-places.test.js` obtains two real OIDC grants with fictional accounts
and different website hostnames. It checks per-site names and evidence choices,
private routes/export and account isolation, expired/withdrawn projection,
client-disabled confirmations, and disconnection of only one website. Browser
checks cover keyboard expansion, destination selection, and widths of 1220, 375
and 320 pixels with scripts disabled. Existing tests cover scripted consent.

`UNANYM_CAPTURE_DIR=/tmp/member-places node --test tests/member-places.test.js`
also writes desktop and phone screenshots of the fictional authenticated views.
The WordPress simulation remains the actual receiving-site access test. Neither
test establishes real email delivery or unassisted member/operator usability.
