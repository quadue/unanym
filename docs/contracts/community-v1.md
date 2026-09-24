# Community identity profile 1

Implementation contract, 2026-09-24. New standalone and explicitly configured
FRRN-backed v1 deployments use this profile.
It is not a claim of an adopted international standard or certified deployment.
Existing clients remain on the explicitly separate legacy profile until migrated.

## Website interface

OpenID Connect authorization code + S256 PKCE remains the website interface.
`openid profile` supplies the website-specific `sub` and chosen `name`. The
account key is `(iss, sub)`. No account email, global persona or Pubky key is
disclosed. A host and its registrations choose one contract profile; unknown host profiles
fail. New standalone and FRRN-backed hosts serve v1 only, while an existing
legacy issuer retains its legacy profile. There is no mixed-profile upgrade at one issuer in this pilot.

| Scope | Claim | Meaning |
| --- | --- | --- |
| `identity.v1` | `identity_v1` | `{version:1, public_key:<Ed25519 hex>, custody:"operator", operator:{id:<issuer>, name:<display label>}}` |
| `memberships.v1` | `memberships_v1` | `{version:1, statements:[<compact signed JWT>, ...]}` containing only selected, currently approved memberships |

The operator custodies the website key even if the member signs in through Ring.
Sign-in method does not change key custody or authorise publication of a Pubky
identifier. A later holder-key profile requires a separate proof and custody
implementation; do not imply it by changing a string.

Issuer and website registration are installation settings. No community's URL
is a standalone default. Brand names are not protocol identifiers.

## Membership statement

Protected JWT header: `typ=community-membership+jwt`, `alg=EdDSA`, `kid` is the
public JWK SHA-256 thumbprint. Payload is exactly:

```json
{
  "ver": 1,
  "iss": "https://identity.example/identity/oidc",
  "sub": "opaque-website-specific-subject",
  "aud": "registered-website-id",
  "iat": 1790251200,
  "nbf": 1790251200,
  "exp": 1790251500,
  "jti": "unique-statement-id",
  "organisation": {"id": "urn:uuid:stable-organisation-id", "name": "Example organisation"},
  "membership": {"kind": "member", "status": "active", "approved_at": "2026-09-24T11:00:00Z", "valid_until": null},
  "authority": {"mode": "operator_attested"}
}
```

No email, approver identity, global membership/person ID, training qualification,
trust score or safety judgment is included. Names are display-only. The service
keeps its approval audit privately; the receiver identifies an organisation by
its stable ID. Statements expire after at most five minutes and no later than
membership expiry. `valid_until:null` means the approved record has no scheduled
end; it does not make the signed statement perpetual.

Two evidence modes are deliberately distinct:

- **`operator_attested`**: `iss` is the service operator. Its signature asserts
  that an administrator authorised for this organisation approved membership
  in its managed records. It is not an organisation-held-key signature.
- **`organisation_signed`**: `iss` equals `organisation.id`. The organisation's
  separately controlled, explicitly trusted key signs the same receiver-specific
  statement. The operator may relay it but cannot mint this mode using its own
  key. Initial standalone administration emits only `operator_attested`.

The receiver configures trusted signer/key/organisation/mode combinations out of
band. A self-asserted organisation ID or an embedded key is not authority.
`verifyMembership` verifies against the supplied trust tuple; it never fetches
an arbitrary URL from the statement. Validate signature, type, version, issuer,
subject, audience, time, organisation and evidence mode. Unknown fields/versions
fail. Verify organisation keys and rotations through an authenticated authority
process; key control alone does not establish organisational legitimacy.

Receivers fetch current UserInfo for current access. Revoked or expired
membership disappears there immediately. Cached statements last until expiry;
they are not a revocation oracle. Disclosure withdrawal revokes this connection's
access tokens. Neither operation erases a recipient's earlier copies.

## Pubky decision

1. **Optional sign-in/link**: support a future Ring handoff beside email-code
   authentication. Bind it to a browser challenge, app identity, timeout, expected
   capabilities and one-time consumption. Linking requires control of both the
   existing local account and Pubky identity; never match names. Keep the Pubky
   key private to the account service by default. Avoid homeserver write access
   for mere sign-in. Ring is not required for the first ordinary member flow.
2. **Organisation signing**: the contract supports an organisation's own
   Ed25519 key, including a Pubky-compatible key. This is separate from member
   authentication. Pin that key to the accepted organisation and preserve proof
   through relay. The verifier and contract tests cover this mode now; production
   organisational key enrolment, rotation and issuance remain a separate adapter.
3. **Do not claim Ring can sign arbitrary memberships.** Its documented auth
   token grants homeserver access. That is not a signature over this membership
   JWT. A signing tool/adapter needs its own tested exact-payload authorisation.
4. **No public member list.** Pubky storage is optional transport. Private claims
   must not be published as plaintext on a public homeserver. No storage migration
   or public-key linkage follows from offering optional sign-in.

Evidence checked 2026-09-24: [Pubky authentication](https://pubky.org/explore/pubky-protocol/authentication/),
[Ring accepted actions](https://github.com/pubky/pubky-ring), and the local kernel
`docs/pubky-integration-rehearsal.md`. That rehearsal uses SDK approval standing
in for Ring; it does not prove Ring UI integration or organisation approval.

## Legacy and release boundary

`drop_identity`, `drop_memberships`, `pact-hosted` and
`current-pact-membership` remain only in the legacy profile. Existing signed
records are immutable. Do not reinterpret them as organisation-approved v1.
An existing account, issuer or client transition needs an explicit mapping and
rollback rehearsal. A new client cannot silently select the legacy profile on
the standalone host. Neutral names alone do not force a website reinstall;
changing the actual negotiated contract does require a coordinated client update.

The current WordPress companion consumes v1 and has passed an automated
standalone rehearsal with fictional accounts. It is a staging pilot, not a
public onboarding release. Actual-site policy, organisation mandate and real
member acceptance remain required. The old HTML ZIP is a legacy regression
fixture; HTML integration is outside the current scope. See `docs/standalone.md`
for operation and `docs/release.md` for dated evidence.
