# Wallet experiment: independent issuer → existing wallet → Unanym

Experiment branch, 2026-09-25. Not released, not deployed, and not a supported
sign-in path. Membership profile 1 is unchanged except for a candidate evidence
mode, `wallet_verified`, that only this branch emits.

## What was tested

A fictional organisation's credential is issued by walt.id **Issuer2** (OpenID4VCI
1.0) into walt.id **Wallet API v2**. A member signed in to Unanym opens *Add from
your wallet*; the wallet answers Unanym's OpenID4VP 1.0 request (DCQL, `direct_post`,
`redirect_uri:` client identifier). Unanym verifies the SD-JWT VC and holder proof,
links the membership to the signed-in account, and afterwards gives each website
only its ordinary website-specific statement. Exact image digests, the credential
format and every check are in [the evidence record](evidence/wallet-experiment.json).
The harness and how to rerun it are in `experiments/wallet/README.md`.

All 14 checks passed:

| Acceptance criterion | Result |
| --- | --- |
| Only an accepted organisation's valid membership, presented by its holder, counts; wrong audience and replayed proofs fail | Passed. Unit tests also refuse forged or untrusted issuers, another holder's key, stale or swapped proofs, injected disclosures, expired credentials and another organisation. |
| Organisation withdrawal and withdrawal of sharing consent close future access within a measured bound | Revocation → denial **2.0 s** (5 s refresh). Status service outage → denial **19.1 s** (20 s freshness bound). Unticking one website stops only that website. |
| Two websites receive no unintended common person-specific identifiers, raw credential signatures or holder keys | Passed for credential material. Residual common values are listed below. |
| Renewal or wallet replacement preserves the website account | A new wallet with a new key and credential kept the same website subject. |
| Members without a wallet complete the hosted journey | Passed. |

## Findings

1. **The final-specification path works with existing software.** Only walt.id's
   v2 components implement OpenID4VCI 1.0 and OpenID4VP 1.0; its `stable` image
   tag did not match the configuration in its current source, so the experiment
   pins image digests and the source commit together.
2. **walt.id's open-source status check does not establish freshness.** At commit
   `6b9c8d7`, its status policy downloads the list and reads the bit, but does not
   verify the list's signature, subject or expiry, and applies no maximum age
   (`StatusValidatorBase`, empty `customValidations`). Unanym therefore verifies
   status lists itself: issuer signature, `sub` equal to the referenced URI, not
   expired, and no older than the receiver's own bound. Without such a list the
   membership is not shared. Worth reporting upstream.
3. **The credential carries stable correlators.** Every presentation of the same
   credential repeats its holder key, issuer signature, status list index and
   timestamps. This issuer configuration advertises no batch issuance. In this
   architecture websites never receive the credential: Unanym returns a separate
   statement per website, and the run confirmed none of that material reaches them.
4. **Residual common values between websites.** Statement `iat`/`exp` coincide when
   two websites fetch in the same second (timing), and the wallet membership's
   `approved_at` and `valid_until` are shared at day precision. The hosted path
   today shares the organiser's **exact** approval timestamp with every website the
   member chooses; coarsening it to the day would reduce that correlation.
5. **Who can see what.** Websites see a website-specific subject, the chosen name and
   selected statements. Unanym sees the credential, holder key, status reference and
   every website it serves, so the operator can link a member's websites, as it can
   today. The issuer sees only that its list is fetched, not which entry or website.
6. **The WordPress companion refuses the new evidence mode** and treats it as an
   invalid statement, which fails that member's whole membership check on the site.
   Wallet memberships must therefore be offered only to websites that have opted in,
   and the companion needs an explicit setting before any real WordPress test.

## Not established

- The real WordPress member page (the companion change and the WordPress lab rehearsal
  are the next step), a human using a phone wallet, other wallets, a real organisation's
  issuer and keys, HTTPS deployment, and batch issuance.
- Cross-device request phishing: whoever opens a request link binds the credential to
  the account that created it. The member must confirm the requesting service in their
  wallet; this is a known OpenID4VP cross-device risk, not solved here.
