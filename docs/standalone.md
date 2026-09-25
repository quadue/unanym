# Standalone operator pilot — community-v1

This entry point has its own persistent email-code accounts and organisation
administration, independent of any community platform's cookies or database.
WordPress is the supported receiving-site target for this pilot. Integration
with other website platforms is outside its current scope.

## Start a new installation

Use Node 24, a persistent private data directory and an HTTPS reverse proxy.
Install with `npm ci && npm run build`. Use a **new** issuer and data directory
for this pilot; changing an existing issuer requires an explicit migration.
`src/server.js` remains the legacy adapter entry point. Use `npm run start:standalone`.

Create a private environment file containing these installation-specific values:

```sh
IDENTITY_ORIGIN=https://identity.example.org
IDENTITY_OPERATOR_NAME='Example identity operator'
IDENTITY_DISPLAY_NAME='Your community sign-in'
IDENTITY_BOOTSTRAP_EMAIL=operator@example.org
IDENTITY_DATA_DIR=/var/lib/unanym
IDENTITY_CLIENTS=/etc/unanym/clients.json
IDENTITY_CLIENT_SECRETS=/etc/unanym/client-secrets.json
IDENTITY_SMTP_FILE=/etc/unanym/smtp.json
HOST=127.0.0.1
PORT=4080
```

Supply your own domain and operator. The origin has no trailing path or slash.
`IDENTITY_DISPLAY_NAME` is the member-facing name (default `FRRN`); the operator
name separately identifies who holds the records and signs statements. Optional
`IDENTITY_DEVELOPER_URL` points the “Identity by Unanym” footer to your HTTPS
documentation site. Its default is `/identity/developers`. Neither setting changes
the issuer, claims, signing keys or account mappings. The FRRN operator's intended
documentation host is `https://unanym.frrn.life`; its publication is separate.
Configure your process manager to load these variables, run the standalone start
command, and restart after failure. Terminate TLS at the loopback reverse proxy;
overwrite forwarded headers, enforce HTTPS, and never cache account/OIDC pages.
Restrict the environment, JSON secrets and data to the service account. The
service refuses non-HTTPS remote origins and uses secure host-only account
cookies on HTTPS. Exposing the Node port directly bypasses this deployment design.

Start with `clients.json` containing `[]` and `client-secrets.json` containing
`{}`. Add a WordPress client when its administrator supplies the exact callback:

```json
[{
  "client_id": "example-wordpress",
  "name": "Example community",
  "description": "Sign in to the community website.",
  "homepage": "https://community.example.org/",
  "redirect_uris": ["https://community.example.org/wp-admin/admin-ajax.php?action=openid-connect-authorize"],
  "token_endpoint_auth_method": "client_secret_post",
  "allow_refresh": true
}]
```

Create a random secret of at least 32 characters in the private secrets file,
keyed by `example-wordpress`. Restart after changing registrations. Share it
only with that website administrator through an agreed private channel.

`smtp.json` (mode 0600) contains `host`, integer `port`, `from`, and
`auth: {user, pass}`. Use authenticated SMTP: port 465 uses TLS immediately;
other ports require STARTTLS. Certificate validation remains enabled. The
server fails startup without a transport configuration and never prints codes.
Delivery failure invalidates that code. SMTP acceptance is not inbox delivery;
verify delivery, spam placement and retry usability using an authorised test
recipient before involving members. No real delivery has been tested here.

## Appoint and approve

1. Sign in at `/identity/login` using the configured bootstrap email. Only
   its first successful email proof bootstraps the operator. Changing the
   environment later does not transfer an existing operator role.
2. Register an organisation with its real name, administrator email and private
   authorisation reference. Verify that appointment outside the software first.
   The organisation receives a stable ID; display names are not authority.
3. The appointed administrator signs in with their own email, opens their
   organisation and approves or revokes members. An approval can expire.
   The operator role alone cannot use another organisation's membership form.
4. Each member signs in and chooses a name and memberships per website. Admin
   emails, member emails and internal member IDs do not appear in website claims.

Registration assigns access but does not send an invitation email. Give the
appointed administrator the sign-in URL through the agreed channel. There is no
bulk import, open admin self-enrolment, delegation UI or organisation-key wallet.
Administrative role transfer/removal currently requires a reviewed offline
operator procedure, not member sign-in. Email compromise compromises that
person's account; stronger administrator authentication is a release follow-up.

The private audit records actor, organisation, target and approval/revocation
changes. It is an operator-held database audit, not an immutable external
organisation ledger. The operator retains database and key control. The emitted
proof is `operator_attested`: the operator asserts an assigned admin approved
this organisation's membership. It does not prove training or personal safety.

## WordPress

Members see “Continue with FRRN” by default, or the operator's configured display
name. The plugin's administrative settings remain “Unanym”. Saving the connection
reads the public `/identity/presentation` metadata and applies the member label;
existing installations must save their connection again to refresh that label.
Keep the existing issuer, client ID, organisation policy and key fingerprint.

Use the maintained OpenID Connect Generic Client (rehearsed: 3.11.3) and the
companion source in `integrations/wordpress/drop-identity`. Install only on an
isolated staging site until the actual site's plugins pass acceptance. Settings
→ Unanym accepts issuer, client ID, secret and recognised organisation IDs.
New setup requires v1 scopes. The setup pins the operator's membership key from
its HTTPS endpoint and refuses a later silent key replacement. Review the key
fingerprint and organisation ID with the operator. Legacy installed settings
retain their previous scopes; changing contract with linked users is refused.

The companion verifies membership signature, version, signer, website, subject,
expiry and operator authority; only explicitly recognised organisation IDs reach
`unanym_has_membership($organisation_id)`. It checks current UserInfo on each
connected request and fails closed during outages. Empty recognition means
sign-in only. PHP Sodium is required. No email is supplied; new accounts are
Subscribers. Existing accounts link from their WordPress profile after ordinary
sign-in, preserving their account, roles and email without email matching.

**Choose a simple member area.** Create a WordPress page with Private visibility.
Settings → Unanym lets the site administrator select this page and one recognised
organisation. Save the member area. The member landing screen then links to it.
This uses current membership for one page, with no permanent role promotion.
Withdrawing approval or withholding membership closes access on the next request.
The configured page stays private if the companion is disabled, and cannot be
accidentally published while configured. Native editors/admins retain their
existing permissions.

This is not automatic protection of existing public posts, uploaded files or
other plugins. The selected page's content is protected; media URLs, caches,
custom APIs and other membership plugins need their own reviewed policy. The
helper remains available for other integrations. See [the complete setup and
rehearsal](frrn-host.md#connect-a-wordpress-website).

The public download routes remain gated. Build output is a staging artifact,
not a public release. New HTML distribution is out of scope.

## Recovery and operations

Email-code sign-in recovers access while the person controls that mailbox.
Codes have a ten-minute lifetime, five attempts, browser binding and persistent
email/IP throttles. Account sessions last one day. Duplicate account cookies
fail closed. No master code or public reset endpoint exists. Lost-mailbox
recovery, self-service deletion and administrator transfer need an agreed,
reviewed process before a broader release; do not improvise identity merges.
Agree retention, support and account removal with the pilot organisation.

Back up accounts, identity data, keys, profile and registrations as one unit:

1. Stop the standalone process cleanly. Backup refuses a live host's lock.
2. Run `node scripts/backup.js /private/new-snapshot` with the same data,
   registration and secret-file variables. The stopped host permits a consistent
   snapshot of both databases. Encrypt and replicate it off host.
3. Run `node scripts/restore.js /private/new-snapshot /private/empty-restore`.
4. Keep the original issuer, client IDs, keys, operator settings and SMTP config;
   restart pointing to the restored files. Do not run two hosts on the same data.

A crashed host leaves `standalone.lock`. Verify the recorded process is no longer
running before removing that stale lock. The service never steals a live lock.
A corrupted or missing lock needs operator inspection. SMTP settings are not in
the backup; preserve them securely separately. Snapshots contain emails, sessions
and signing material, not just public configuration. Hash checks detect damage,
not a malicious party rewriting both the backup and its manifest.

Moving the service requires continued control of the same issuer domain and
path, not merely possession of the signing key. Freeze the old writer before
cutover. Preserve accounts, per-site subjects, approvals, sharing choices and
withdrawals. A rollback after new writes must carry those writes forward; an
older backup can otherwise revive withdrawn access. See the
[portability boundaries and acceptance plan](portability.md).

## Reproduce acceptance

```sh
npm run verify
UNANYM_LAB_NAME=unanym-standalone UNANYM_WP_PORT=4302 UNANYM_DB_PORT=43316 scripts/wordpress/lab.sh start
node scripts/wordpress/standalone-rehearse.js
UNANYM_LAB_NAME=unanym-standalone UNANYM_WP_PORT=4302 UNANYM_DB_PORT=43316 scripts/wordpress/lab.sh stop
```

Node tests need the installed Chromium. Cross-language contract verification uses
PHP with Sodium, or the pinned PHP 8.3 Docker image if PHP is absent. The separate
WordPress lab uses Docker and loopback ports 4300, 4302, 43316 with synthetic
members and captured mail. It never uses production credentials or sends email.
Use `reset` to remove only that labelled lab before recreating it. No successful
fixture establishes human usability, delivered email or organisational mandate.
The lab must mount this checkout's companion plugin. The standalone rehearsal
also restores the service twice, checks the same WordPress account and actual
private page after replacement, and confirms disconnection survives the second
restore. This is a local service replacement, not a Pubky or physical host move.
