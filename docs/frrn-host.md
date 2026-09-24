# One membership authority per installation

Unanym has two account hosts using the same `community-v1` website contract:

| Installation | Account and membership authority | Identity component |
| --- | --- | --- |
| FRRN-backed | FRRN accounts and explicit organiser approvals | Unanym reads the approved source and handles website consent, subjects and signatures |
| Independent | Unanym's standalone email accounts and organisation administrators | The same Unanym identity core |

These are alternatives. A FRRN-backed installation never opens a standalone
account database or a second organisation-approval screen. An ordinary member
does not register again or seek a second approval.

## What a shareable approval means

FRRN's **Approve request** action both admits the applicant and records the
organiser's membership approval. An organiser can also approve a current member
under **Manage community → Membership approvals**, or withdraw that approval.
Withdrawing the evidence leaves the person's local community profile intact.
It is separate from removing that profile or leaving the community.

Open joining, an invitation alone, historical membership, community creation
and a local resource permission are not organiser-approved membership evidence.
Migration does not backfill approvals. Existing members need an explicit
organiser decision if they will share this type of evidence. A separate organiser
must approve an organiser's own membership.

The source is limited to configured community IDs and authorised approvers.
Only active memberships with current agreement consent and a runnable community
are eligible. Leaving clears the approval; rejoining cannot revive it. Sensitive
community readiness and its review date also limit the evidence lifetime.
Changing an entry rule governs future applications; a recorded approval remains
until withdrawal, exit, expiry of community readiness or loss of current consent.

Unanym signs an `operator_attested` membership statement. Its signature asserts
an authorised organiser's recorded decision; it does not turn that decision
into an organisation-held signature, training qualification or safety guarantee.
Approver identities and mandate references stay out of website claims. The
member chooses a website name and which memberships to disclose. Their FRRN
community name is shown as context on the consent screen and is not silently
substituted for the name they choose for that website.

## Configure a FRRN-backed operator

Use a FRRN release that provides `identity_source_instance` and the read-only
`identity_memberships_v1` projection (community app migration 15). Keep FRRN as
the only writer. The adapter needs a read-only view of its SQLite database and
WAL files, plus the source pause file. Keep that file in sync with the FRRN
release configuration: `alpha`, `beta` or `live` permits identity reads; missing
or `closed` denies them. FRRN itself reads its release mode from the environment,
so changing only that environment does not update the adapter pause file.
It is a co-hosted integration, not a
remote-database protocol.

Create a restricted source binding file using stable IDs supplied by FRRN:

```json
[
  {
    "community_id": "FRRN-COMMUNITY-ID",
    "organisation": {
      "id": "urn:uuid:YOUR-STABLE-ORGANISATION-ID",
      "name": "Your association"
    },
    "approvers": [
      {
        "user_id": "FRRN-ORGANISER-ACCOUNT-ID",
        "authorisation_reference": "Reference to this organisation's actual appointment"
      }
    ]
  }
]
```

The operator records a genuine mandate when installing a real organisation;
software configuration is not evidence that the mandate exists. No particular
organisation, organiser, site URL or community practice is built into the code.
Approvers must be active organisers at setup. Replacing the approved source list
requires a restart; removing an approver also stops sharing their earlier
approvals until a recognised organiser makes a new decision.

Configure ordinary operator/client settings from [the operator guide](standalone.md),
then use:

```sh
export IDENTITY_CONTRACT=community-v1
export IDENTITY_ORIGIN=https://your-frrn-host.example
export IDENTITY_OPERATOR_NAME='Your service operator'
export IDENTITY_DATA_DIR=/restricted/unanym-frrn-v1
export PACT_DB_PATH=/restricted/frrn/community.sqlite
export PACT_MODE_FILE=/restricted/frrn/release-mode
export FRRN_MEMBERSHIP_SOURCES=/restricted/frrn-sources.json
npm run start:frrn
```

Route `/identity` and `/identity/*` to Unanym and other paths to FRRN on the same
public origin. This reuses the existing browser-bound FRRN session and sign-in
return path. The identity host never receives account emails through its adapter.
Keep the FRRN database and backup separate from the identity data directory.

Use a fresh directory and explicitly registered v1 clients. Do not change an
existing legacy issuer from `drop_*` to v1 in place. A distinct issuer changes
`(iss, sub)` and therefore needs explicit account linking/migration. The host pins
its issuer, account-source type and FRRN database instance; it refuses silently
switching to standalone accounts or a different FRRN database.

Offline backup accepts `FRRN_MEMBERSHIP_SOURCES` and includes the identity
profile, keys, registry and source bindings. Restore FRRN's database separately
with the same instance and account IDs. A backup of Unanym alone is insufficient
for a FRRN-backed deployment.

## Connect a WordPress website

1. Install OpenID Connect Generic Client and the built Unanym companion.
2. In **Settings → Unanym**, enter the registered issuer, client ID and secret.
   Select the organisation IDs this site chooses to trust, and save.
3. Create a WordPress page with **Visibility: Private**. Under Unanym settings,
   choose that page and its required organisation membership. Save the member area.

The member follows **Continue with FRRN**, chooses their name and membership,
then selects **Open member area**. Existing WordPress users explicitly connect
from their profile after signing in normally. There is no name/email matching.
No site-specific PHP is needed for this single private-page policy.

The companion grants read access to that page for the current request only.
It does not assign a permanent role or grant access to all private pages. Native
WordPress editors and administrators keep their existing authority. Approval
withdrawal or withholding the membership closes access on the next checked
request; disconnecting ends the connected identity session.

The configured page remains private if the plugin is disabled. A normal publish
action cannot make it public while configured as the member area; first remove
that selection if intentionally publishing it. The plugin uses WordPress's
[object capability mapping](https://developer.wordpress.org/reference/hooks/map_meta_cap/)
with its native private-page behavior.

This protects the selected page's text/content. It does not secure public upload
URLs, existing public pages, other membership plugins, multisite, custom APIs or
a cache that bypasses PHP. Configure caches to bypass private/signed-in pages.
Keep files outside public uploads or use a separately tested download policy.

## Reproduce the complete chain

Build the FRRN community app in its checkout, then from this Unanym checkout:

```sh
npm ci
npm run build
UNANYM_LAB_NAME=unanym-frrn UNANYM_WP_PORT=4342 UNANYM_DB_PORT=43308 \
  bash scripts/wordpress/lab.sh start
FRRN_APP_ROOT=/path/to/frrn-community-app node scripts/wordpress/frrn-rehearse.js
UNANYM_LAB_NAME=unanym-frrn bash scripts/wordpress/lab.sh stop
```

The lab owns only containers labelled and named `unanym-frrn-wp` and
`unanym-frrn-wp-db`. The rehearsal creates a temporary FRRN database, a temporary
identity directory and a same-origin gateway on ports 4340/4341. It exercises
actual sign-in, application, approval, consent and WordPress forms. Synthetic
sign-in links replace mail delivery. It removes temporary identity/account
data when finished; the dedicated WordPress lab can be reset separately.

The checked-in [acceptance record](evidence/frrn-wordpress.json) records the
tested boundaries. It proves a working synthetic software chain, not a real
organisation mandate, inbox delivery, member usability or universal compatibility.
