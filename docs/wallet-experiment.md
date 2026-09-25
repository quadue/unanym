# Wallet experiment: independent issuer → existing wallet → Unanym

Experiment branch, 2026-09-25. Not released, not deployed, and not a supported
sign-in path. The candidate `wallet_verified` extension requires operator enablement,
an explicit website scope and member consent. Ordinary profile-1 clients do not
receive it. The historical measurements below describe the initial `f25fdd7` run.

## What was tested

A fictional organisation's credential is issued by walt.id **Issuer2** (OpenID4VCI
1.0) into walt.id **Wallet API v2**. A member signed in to Unanym opens *Add from
your wallet*; the wallet answers Unanym's OpenID4VP 1.0 request (DCQL, `direct_post`,
`redirect_uri:` client identifier). Unanym verifies the SD-JWT VC and holder proof,
stages the membership, returns a one-time completion code to the wallet, and requires
confirmation in the original browser/account session before linking. Afterwards it gives each website
only its ordinary website-specific statement. Exact image digests, the credential
format and every check are in [the evidence record](evidence/wallet-experiment.json).
The harness and how to rerun it are in `experiments/wallet/README.md`.

All 14 checks passed in the initial mock-site run:

| Acceptance criterion | Result |
| --- | --- |
| Only an accepted organisation's valid membership, presented by its holder, counts; wrong audience and replayed proofs fail | Passed. Unit tests also refuse forged or untrusted issuers, another holder's key, stale or swapped proofs, injected disclosures, expired credentials and another organisation. |
| Organisation withdrawal and withdrawal of sharing consent remove the membership from UserInfo within a measured bound | Revocation → omission **2.0 s** (5 s refresh). Status service outage → omission **19.1 s** (20 s freshness bound). Unticking one website stops only that website. These initial checks did not test a protected WordPress page. |
| Two websites receive no unintended common person-specific identifiers, raw credential signatures or holder keys | Passed for credential material. Residual common values are listed below. |
| Renewal or wallet replacement preserves the website account | A new wallet with a new key and credential kept the same website subject. |
| Members without a wallet complete the hosted journey | Passed. |

## Findings

1. **The final-specification path works with existing software.** Only walt.id's
   v2 components implement OpenID4VCI 1.0 and OpenID4VP 1.0; its `stable` image
   tag did not match the configuration in its current source, so the experiment
   pins image digests and the source commit together.
2. **Status verification needs a version-specific assessment.** The original
   finding inspected the older `waltid-verification-policies` implementation. At
   the same commit `6b9c8d7`, `waltid-verification-policies2` wires a
   `StatusListSignatureVerifier` into `StatusPolicyImplementation`; its base
   validator verifies signatures, authorises the signer and checks the IETF list
   URI. The blanket claim that walt.id v2 does not verify signatures was not
   established. A maximum-age guarantee still needs an actual v2 policy test;
   this experiment does not run walt.id's verifier. Unanym verifies
   status lists itself: issuer signature, `sub` equal to the referenced URI, not
   expired, and no older than the receiver's own bound. Without such a list the
   membership is not shared. No upstream report has been sent.
3. **The credential carries stable correlators.** Every presentation of the same
   credential repeats its holder key, issuer signature, status list index and
   timestamps. This issuer configuration advertises no batch issuance. In this
   architecture websites never receive the credential: Unanym returns a separate
   statement per website, and the run confirmed none of that material reaches them.
4. **Residual common values between websites in the original run.** Statement `iat`/`exp` coincide when
   two websites fetch in the same second (timing), and the wallet membership's
   `approved_at` and `valid_until` are shared at day precision. The hosted path
   today shares the organiser's **exact** approval timestamp with every website the
   member chooses; coarsening it to the day would reduce that correlation. The
   revised wallet extension sends neither approval nor credential-expiry dates.
   Token expiry is capped by the checked evidence deadline, so technical timing
   can still correlate. There is no general unlinkability claim.
5. **Who can see what.** Websites see a website-specific subject, the chosen name and
   selected statements. Unanym sees the credential, holder key, status reference and
   every website it serves, so the operator can link a member's websites, as it can
   today. The issuer sees only that its list is fetched, not which entry or website.
6. **The original WordPress companion refused the new evidence mode** and treated it as an
   invalid statement, which fails that member's whole membership check on the site.
   The branch now gates the extension and includes an explicit WordPress setting.
   A valid unaccepted wallet statement is ignored without discarding a separate
   hosted membership; malformed or forged evidence still fails closed.

## Follow-up changes

- Cached status-list expiry and maximum age are checked on every membership read.
  A statement cannot outlive the credential, status-list expiry or freshness
  deadline. Status caching is keyed by issuer and URI. An older refresh cannot
  overwrite a newer list. Unit tests cover short list expiry and the exact
  20-second outage boundary without an extra refresh interval.
- Exact credential expiry stays internal instead of being rounded to midnight.
  The member view labels the date as **Linked**, not an organisation approval.
  Website membership dates are null in this experimental mode; technical token
  times remain visible. Imminently expiring evidence may be withheld in its last
  second to avoid issuing an already-expired statement.
- A wallet response does not write or replace an account's credential. The wallet
  receives a secret return code. Completion requires that code, the original
  browser cookie, unchanged account-session binding and explicit same-origin
  confirmation. The test of a forwarded legitimate request leaves the initiating
  account without a membership. Same-device completion is the only supported
  experimental path; no claim is made about arbitrary cross-device protection.
- The receiver extension requires `allow_wallet_memberships: true` in the client
  registry, `wallet.memberships.v1` in the request, and a member's explicit choice.
  The WordPress setting makes that request and controls whether its local policy
  accepts operator-verified wallet evidence.
- The new `experiments/wallet/wordpress.mjs` checks actual private WordPress pages,
  including mixed hosted/wallet memberships, capability changes, individual
  withdrawal, replacement and status outage. Results are recorded separately
  from the original simulated-site evidence.

The follow-up [WordPress run record](evidence/wallet-wordpress.json) has **11
passing checks** on two actual WordPress 7.1.2 installations with Generic Client
3.11.3. Organisation withdrawal closed the protected page in **725 ms**; status
service outage closed it in **17,406 ms**, within the 20-second freshness bound.
These are measured examples, not a promise of sub-second revocation on every run.
The harness allows one second of observation tolerance; exact expiry/freshness
boundaries are separately tested with an injected clock. Native administrator
access and ordinary wallet-free sign-in remained usable. Another credential and
wallet key reused the same website accounts. Browser return, consent and the
WordPress setting were exercised; the wallet presentation itself was driven by
the existing wallet API, not a human phone-wallet interface.

The updated mock-site chain also passed all **15 checks**: membership disappeared
from UserInfo after **2,017 ms** for revocation and **18,104 ms** for a status outage.
Its [separate record](evidence/wallet-follow-up.json) retains the shared technical
timestamps found between websites. Final regression validation passed **39 Node
tests and 17 browser tests**.

## Not established

- A human using a phone wallet, other wallets, a real organisation's
  issuer and keys, HTTPS deployment, and batch issuance.
- Cross-device completion and phishing resistance for arbitrary wallets. Merely
  confirming the service's name does not bind a wallet holder to a web account.
  This branch instead refuses completion outside the originating browser/session.
- General-purpose SD-JWT verification or OpenID certification. This is one pinned,
  top-level membership-claim profile with a narrow verifier, not a full wallet SDK.
