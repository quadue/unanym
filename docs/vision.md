# Vision: separable authority

This is the target architecture, not a description of the current service.
Today's Unanym is operator-custodied: the operator holds the records and every
key, signs every statement websites receive, and could impersonate a member to
a website. It meets none of the acceptance conditions in section 6. The
[development backlog](roadmap.md) lists the bounded experiments that move
toward this target; each needs its own acceptance criteria before it becomes a
release commitment.

## 1. Constitutional separation of authority

The architecture distinguishes five responsibilities:

- **Holder:** controls identity keys, contextual personas, credentials,
  disclosures and authorised recovery.
- **Issuer:** attests memberships, roles, qualifications, contributions or other
  facts within a defined authority.
- **Verifier:** checks evidence and independently determines its relevance,
  trustworthiness and admissibility.
- **Service:** governs access, participation, obligations and permissions
  within its jurisdiction.
- **Infrastructure provider:** stores, synchronises, transports or resolves
  information without thereby acquiring identity or organisational authority.

These responsibilities may coexist in one installation but must remain
logically and cryptographically separable.

No service operator may unilaterally impersonate a self-custodied holder. No
holder may manufacture third-party endorsements. No verifier must accept a
credential merely because its signature is valid.

## 2. Required system properties

**Custody.** Identity-control keys and their recovery authority belong to the
holder, or to parties the holder has explicitly authorised (such as a hosted
operator) under a defined recovery policy. Software providers and storage
operators cannot independently seize or replace that control.

**Contextuality.** The holder creates relationship-specific identifiers, names
and presentations. Cross-context linkage requires an explicit authorised act. A
private common identity need not correspond to any globally published identity.

**Attestation.** Claims remain distinguishable from identities. Portable
evidence records preserve issuer provenance, claim type, subject binding,
scope, time, validity, status and relevant supporting acts. Authentication,
evidence validity, organisational legitimacy and authorisation are separate
judgments.

**Consent and privacy.** Disclosure is recipient-specific, purpose-aware and
minimised. Presentation requests identify the receiving party and requested
information. Protocols must resist replay, unnecessary correlation and silent
disclosure. Selective disclosure does not, by itself, establish unlinkability.

**Portability.** Keys, credentials, connection records and recoverable private
data can move between compatible independent implementations. Existing website
identities survive replacement of providers through verifier-recognised
continuity or explicit account migration.

**Continuity and recovery.** Device loss, key compromise, operator failure and
provider migration are distinct recovery events. Each requires authenticated
transitions, authorised key rotation and preservation of security-relevant
state, including withdrawals and revocations.

**Distributed authority.** Membership admission and revocation belong to
authorised organisations. Website permissions belong to websites. Neither
decision becomes universally binding merely because evidence is portable.

**Contestability.** Evidence remains attributable and inspectable, while its
interpretation, relevance and reputation consequences remain contextual.
Disputed, expired, withdrawn and superseded records must be distinguishable.

## 3. Architectural implementation

A user-controlled wallet manages local keys, personas, credentials and consent.
Independent issuers produce signed credentials; compatible verifiers evaluate
proofs without requiring Unanym's original operator to participate.

Wallets are optional. A hosted account remains a supported path for people who
do not want to hold keys, with its trade-off stated plainly: the operator holds
those keys on the member's behalf.

Issuance and presentation use standard protocols; OpenID4VCI and OpenID4VP are
the leading candidates. The credential format (for example W3C Verifiable
Credentials or SD-JWT VC), status mechanisms and stronger unlinkable proofs are
selected through explicit interoperability and privacy profiles, agreed in the
credential interoperability experiment rather than in advance.

Identity-control identifiers must support authenticated continuity and rotation
without requiring one publicly shared root identifier. DIDs are an available
mechanism, not a mandatory dependency.

Private records are encrypted before optional external storage or replication.
Pubky, self-hosted servers and other distributed transports are interchangeable
infrastructure candidates, not identity authorities. No blockchain,
cryptocurrency wallet, global identity registry or mandatory hardware
attestation is required.

Passkeys may simplify authentication or protect device-local operations, but
must not become a compulsory dependency on a particular platform ecosystem.

## 4. Relationship to communities and coordination

Unanym establishes identity continuity and the provenance of evidence. It does
not impose a universal reputation score or a universal interpretation of trust,
and it does not compile participation histories.

A claim is linked to the attributable act that supports it, such as an
organiser's approval, rather than standing as an unsupported status label. New
claim types are added one at a time, each from an evidenced use case with a
named issuer, subject, scope, expiry and withdrawal rule.

Receiving communities may independently recognise, reject, contextualise or
contest such evidence.

Complementary systems such as FRRN may manage community authority, commitments,
resource permissions and evaluated state. Their operational decisions remain
separate from Unanym's identity and credential mechanisms.

## 5. Migration from the existing implementation

The existing operator-custodied service remains a supported path for members
who choose it, and the compatibility path during migration.

The transition first introduces independent issuer signatures and
holder-controlled keys. Receiving websites then acquire the ability to bind
existing accounts to holder-controlled credentials, verify portable
attestations and recognise authorised key transitions.

Existing OpenID Connect issuer/subject relationships cannot be assumed to
survive a change of operator automatically. They require explicit account
binding, migration procedures and receiving-site cooperation.

Older operator-attested records retain their original provenance. They must
never be silently reclassified as independently issued credentials.

## 6. Acceptance conditions

A conforming decentralised deployment must demonstrate that:

1. Two independently operated wallet implementations can control and present
   the same legitimately migrated identity and credentials.
2. Independent organisations can issue, rotate and revoke credentials without
   delegating signing authority to Unanym.
3. Independent websites can recognise the holder's identity and valid evidence
   without contacting the original Unanym operator.
4. Removal or compromise of the original operator does not itself grant
   impersonation power or destroy already established, independently supported
   account continuity.
5. Loss of a device can be recovered under an authorised policy without
   overriding the holder's custody guarantees.
6. Cross-website correlation is evaluated against an explicit threat model,
   including identifiers, credential reuse, status checks and metadata.
7. Revocation, withdrawal, stale information and recovery from older backups
   cannot silently restore unauthorised access.
8. Verification results distinguish demonstrated properties from assumptions
   and unsupported operating conditions.

## 7. Boundaries of the promise

Self-custody does not guarantee recovery after the loss of every authorised key
and recovery factor. Credential portability does not compel organisations to
continue granting membership or websites to accept an identity. Revocation
cannot erase information already disclosed to recipients. Encryption alone
cannot eliminate metadata leakage.

The purpose of Unanym is not to eliminate every authority, but to prevent one
authority from acquiring powers that properly belong to another.

Its success is measured by whether people can preserve identity and evidence
across changing providers, while communities remain free to govern
participation and interpret claims under their own accountable rules.

Identity belongs to the person. Attestations belong to their issuers. Access
belongs to its governing authority. Infrastructure must remain replaceable.
