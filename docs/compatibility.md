# Compatibility

| Component | Tested state | Boundary |
| --- | --- | --- |
| Node.js | 24, local Linux | Required runtime for this candidate |
| SQLite | Pinned better-sqlite3 | Persistent local storage; one process per data directory |
| WordPress | 7.1.2, PHP 8.3 | Single-site installation; synthetic local acceptance |
| OpenID Connect Generic Client | 3.11.3 | Companion adds required session, linking and membership checks |
| PHP Sodium | Signature verification exercised | Required for v1 membership statements |
| Native private member page | Actual page, REST, search/feed denial and plugin-disabled privacy tested | One selected page; uploaded assets remain separate |
| FRRN account source | Community source v1, migration 15 | Explicit approvals, read-only co-hosted SQLite adapter; no legacy wire-contract migration |
| Other WordPress plugins | Not established | Test the actual content policy, email requirements and caching |
| WordPress Multisite | Not supported by this pilot | Setup refuses it |
| Other OIDC clients | Protocol is documented; no platform acceptance claimed | Need their own adapter and integration tests |
| Static HTML membership areas | Not supported | A public browser page cannot protect server resources |
| Pubky Ring / organisation-held keys | Design/contract boundary only | Not implemented authentication/key-enrolment paths |

The WordPress fixture uses the operator-attested v1 contract, explicit organisation
recognition. The independent-host fixture uses a server-side admission probe;
the FRRN-backed fixture opens an actual native private page. It checks new accounts,
explicit linking, membership approval/revocation, disclosure withdrawal, renewal,
outage handling and ordinary WordPress login. It does not certify every theme,
plugin, external mail provider or end user's browser/device.
