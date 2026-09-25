# Portability without changing the member's website account

Architecture direction agreed 2026-09-25. This is a delivery boundary and
acceptance plan, not a claim that a Pubky bridge or portable member wallet ships.
The first supported receiving platform remains WordPress with ordinary sign-in.

## Separate the responsibilities

| Part | Responsibility | Current boundary |
| --- | --- | --- |
| Storage and transport | Locate, retain and deliver bytes | Hosted databases today; Pubky is an optional future adapter |
| FRRN kernel | Verify and interpret signed events, scope and contextual trust | A separate integration; Unanym is not the full kernel workspace |
| Unanym | Per-website names, selected memberships and OpenID Connect | Operator custody with explicit member choices |
| Organisation and website | Authorise approvers; decide whose evidence grants access | A signature alone does not establish an organisation's authority |

Unanym must remain independently runnable. A wallet, Pubky account or peer-to-peer
network is not required for ordinary member sign-in. Pubky can become a supported
home after a tested adapter and recovery path; making it the default requires a
separate decision. Adding Ring sign-in does not change who holds signing keys.

## Boundaries to preserve

- **Several identities are possible.** A person is not one public key exposed
  everywhere. Keep the website's existing issuer/subject pair and its separate
  chosen name. Linking another identity requires proof of both accounts and an
  explicit choice; never match display names or silently merge email addresses.
- **Continuity includes recovery.** Replacing a storage host, replacing a signing
  key and changing who may approve memberships are different operations. Record
  the authority for each. Do not promise recovery from a lost key by merely
  repointing its discovery record.
- **Private by default.** Do not publish member lists, approvals, website identity
  links or a private workspace's full event log. Encrypt private packets before
  any public storage or peer replication. Public discovery is opt-in and minimal:
  even a service address may reveal a sensitive association. Encryption of content
  does not by itself conceal keys, IP addresses, timing or the communication graph.
- **Withdrawal is about future access.** Remove copies under the operator's
  control according to the agreed retention policy. Destroying encryption keys
  only protects ciphertext if usable key copies no longer exist; it cannot erase
  a recipient's saved keys or plaintext. Append-only signatures do not require
  every replica to retain every record forever.
- **Proof is bounded.** Preserve the actual signer, recognised organisation,
  audience, expiry and evidence mode. Recheck current membership and fail closed
  when required current evidence is unavailable. A saved signed event is not
  perpetual access, organisational legitimacy or a safety judgment.

These requirements apply with an ordinary server as well as Pubky. Hypercore
and peer-to-peer replication remain deferred; no new transport is a prerequisite
for the WordPress pilot. See the [v1 contract](contracts/community-v1.md).

## A service move and a member's storage move are different

An **operator service move** restores Unanym onto replacement infrastructure.
Keep the issuer URL (including path), keys, stored per-site subjects, client
registrations, approvals, connections and withdrawal state. Control of the issuer
domain and its HTTPS endpoint must continue. Sessions may require fresh sign-in;
the website account and the member's choices must survive.

A **member storage move** moves signed/encrypted records between homeservers.
Pubky key continuity can help locate the new copy, but it does not move the
Unanym database, prove an organisation's authority or preserve OIDC account
mappings automatically. A change of issuer or loss of its domain requires an
explicit website-account migration. Never silently issue a new subject for an
existing account or treat an imported event as an approved membership.

## Automated service replacement rehearsal

`scripts/wordpress/standalone-rehearse.js` exercises the existing backup and restore
commands against real local WordPress with fictional accounts and captured mail:

1. An organisation administrator approves a member. The member chooses a name
   and shares membership with WordPress, opening an actual private page.
2. Stop the identity service, back it up and restore into a new directory. Retire
   the original path. Reload keys and settings from the restored files and start
   a replacement service instance at the same issuer. Refuse a changed issuer.
3. Compare keys, registrations, account IDs, organisation authority, membership
   state, website subjects, sharing choices and receipts. Keep the WordPress
   configuration unchanged. The private page remains accessible.
4. Start a new WordPress login. The saved name and choice remain and the existing
   WordPress user is reused. Revoke approval: the next private-page request fails.
5. Disconnect the website, restore again and confirm neither access nor the old
   refresh token returns. Another member's connection remains usable.

Run the [standalone WordPress rehearsal](standalone.md#reproduce-acceptance).
The lab must mount this checkout's plugin; the script refuses a different one.
Its report names the tested boundary. This uses replacement instances on one
workstation. It is not an independent operator restore, a physical host move,
a DNS cutover, a Pubky migration or human acceptance.
The [recorded local run](evidence/standalone-host-move.json) includes all fourteen
WordPress checks and both replacements. It does not replace the earlier evidence.

## Later Pubky acceptance gate

Prepare a separate, disposable two-homeserver lab only when the identity bridge
is ready. Use fictional identities, an explicitly authorised organisation and
the same WordPress account throughout. Keep the gateway issuer stable.

1. Prove control of both the existing member account and optional Pubky identity;
   preserve the site's subject and never send it a global key by default.
2. Transfer only intended signed records and audience-encrypted packets to the
   second home. Verify their bytes, signatures and authorised interpretation.
3. Repoint discovery, allow old caches to settle, then take the first home
   offline. Prove retrieval really uses the new home, not a cached old copy.
4. Sign in again and open the same WordPress account with the same name and
   selected membership, without re-registering the website.
5. Withdraw approval and disconnect after the move. A historical packet must
   not restore access. Preserve the distinction between operator-attested and
   organisation-signed evidence, including trusted key enrolment and rotation.
6. Rehearse recovery and failure: unavailable new host, stale discovery, lost
   device and an unauthorised linking attempt. Preserve withdrawals on recovery.

Take a consistent snapshot with the old writer stopped. A rollback after new
writes must preserve those writes and withdrawals; restoring an older snapshot
blindly can revive access. Independent operating and recovery acceptance follows
the automated lab. No production migration is implied by passing either lab.
