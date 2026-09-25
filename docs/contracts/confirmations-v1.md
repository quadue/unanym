# Optional community confirmations

Candidate extension in 0.4.0-rc.1. Membership profile 1 remains unchanged.
This extension has been simulated locally; it is not an adopted standard or a
qualification-verification service.

## The one supported statement

**Community introduction completed**, confirmed by the named organisation.
An authorised organiser explicitly records that the person completed that
community's introduction. Membership, attendance, resource access and accepting
an agreement never create this statement automatically. A member cannot confirm
their own introduction.

The service operator signs the statement on the organisation's behalf. The
organisation does not hold the signing key in this implementation. It certifies
neither professional training nor safety. The receiving site decides whether to
recognise the organisation. The WordPress companion displays the statement; it
does not turn it into a role, qualification, trust score or admission permission.

## Enable deliberately

1. Register the receiving client with `allow_confirmations: true`.
2. For an FRRN source, add `confirmation_kinds: ["community_introduction"]` to
   that reviewed source binding. Upgrade FRRN's schema before enabling this.
   An old FRRN source without the extension continues to work for membership.
3. On WordPress, select **Receive community introduction confirmations** in
   Settings → Unanym. The site requests `confirmations.v1` in addition to its
   existing scopes. Existing sessions need a new sign-in to request the scope.
4. A member chooses this confirmation separately on the consent screen. It is
   unchecked the first time and never copied from another website's choices.

Standalone administrators use their organisation's **Community introductions**
section. FRRN organisers use **Manage community → Community introductions**;
FRRN remains the only writer for that installation's community records.
The administrator records an observation, not a second membership approval.

## Website contract

Scope `confirmations.v1` supplies claim
`confirmations_v1: {version: 1, statements: [<compact JWT>, ...]}`. No claim is
supplied to a client that has not been enabled. With permission but no currently
selected, valid confirmations, the statements array is empty.

Protected header: `typ=community-confirmation+jwt`, `alg=EdDSA`, `kid` is the
public key thumbprint. It uses the operator key already pinned by the receiver.
The payload has exactly these fields:

```json
{
  "ver": 1,
  "iss": "https://identity.example/identity/oidc",
  "sub": "website-specific-subject",
  "aud": "registered-website-id",
  "iat": 1790251200,
  "nbf": 1790251200,
  "exp": 1790251500,
  "jti": "unique-statement-id",
  "organisation": {"id": "urn:uuid:example-organisation", "name": "Example association"},
  "confirmation": {
    "kind": "community_introduction",
    "status": "confirmed",
    "confirmed_at": "2026-09-24T11:00:00Z",
    "valid_until": null
  },
  "authority": {"mode": "operator_attested"}
}
```

Verify signature, exact type and shape, issuer, subject, audience, accepted
organisation, authority mode and time. Lifetime is at most five minutes. A
membership JWT cannot pass the confirmation verifier, or vice versa. No email,
global identity, shared record ID or organiser's personal identity is included.
Do not accept an embedded key or look up an untrusted signer URL.

## Withdrawal and continuity

Current UserInfo stops returning a withdrawn confirmation. The WordPress
companion checks it on the next connected request. Withdrawal does not remove
membership; membership withdrawal or expiry does hide the confirmation too.
Reapproval can make the existing confirmation available again under an existing
sharing choice. In FRRN, leaving the community removes the confirmation so
rejoining does not resurrect it. A removed or unrecognised confirmer cannot
continue to supply statements.

Changing sharing invalidates that site's previous grants. Disconnect affects
only that member/site pair. Previously saved information cannot be recalled.
Stored signed statements remain verifiable until expiry.

Back up `identity.db` (including `confirmation_choices`) and the account source:
`accounts.db` for standalone, or FRRN's database and reviewed source bindings.
Preserve keys, issuer and client IDs. The standalone restore rehearsal includes
the introduction record, the member's sharing choice and the WordPress display.

Other confirmation kinds, organisation-held signatures and automatic access
rules require a separate design and compatibility review.
