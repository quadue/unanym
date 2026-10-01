# Contributing

Start with a reproducible issue using fictional accounts. Keep changes small and
describe the behaviour being changed, the receiving-site impact and validation.
Use the private route in `SECURITY.md` for suspected vulnerabilities.

Questions and early feedback are welcome in
[Unanym Community](https://t.me/unanymcommunity). Keep private account details and
security reports out of the public chat.

Open ordinary changes against `main` in the canonical private Gitea repository.
Require a successful Verify job on the exact candidate revision before merging.
The workflow is in `.gitea/workflows/verify.yml`; the GitHub copy is secondary.
See [repository workflow](docs/repository.md). Do not include private operator
settings, participant information or completed trial reports in a contribution.

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
