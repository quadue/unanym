# Contributing

Start with a reproducible issue using fictional accounts. Keep changes small and
describe the behaviour being changed, the receiving-site impact and validation.
Use the private route in `SECURITY.md` for suspected vulnerabilities.

Install Node 24, npm and Chromium as described in the README. Run `npm run verify`
before proposing authentication, membership or consent changes. A WordPress change
also needs the isolated WordPress rehearsal. No test may use real member data.

Preserve `(issuer, subject)` identity mappings, explicit account linking and
per-website disclosure. A signature proves the stated signer made an assertion;
do not turn it into a claim about training, safety or an organisation-held key.
Never rewrite historical signed records or quietly change their contract version.

Keep the pinned kernel source and its provenance intact. Propose upstream changes
with their tests and updated hashes. Do not commit runtime data, secrets or a
private environment file. Apache-2.0 contribution and attribution rules apply.
