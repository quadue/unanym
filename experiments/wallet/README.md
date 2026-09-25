# Rerun the wallet experiment

Fictional accounts and a published walt.id **test** key only. Everything listens on
localhost; never expose these services. Findings: `docs/wallet-experiment.md`.

1. **walt.id v2 services.** Clone `github.com/walt-id/waltid-identity` at `6b9c8d7`.
   Copy `docker-compose/{issuer-api2,verifier-api2,wallet-api2}/config` to a working
   directory, then:
   - replace the issuer's `credential-issuer-metadata.conf` with one `community_membership`
     configuration (`format = "dc+sd-jwt"`, `vct = "vctBaseUrl"`, ES256, `jwk` binding);
   - replace its profiles with one `communityMembership` profile holding
     `organisation_id = "urn:example:lakeside-association"`, `organisation_name`,
     selectively disclosable `membership = "member"` and `member_name`;
   - disable the wallet's `auth` feature and point its persistence at a private Postgres;
   - set `webHost = "127.0.0.1"` in **both** API web configurations. Their source
     defaults bind all interfaces; host networking alone is not loopback isolation.

   Run `issuer-api2` (7005), `wallet-api2` (7006) and Postgres with host networking
   and `SERVICE_HOST=localhost`, pinned to the image digests in
   `docs/evidence/wallet-experiment.json`. Host networking avoids firewall rules
   between containers and the host.
2. **Organisation status list:** `node experiments/wallet/org-status.js` (port 7012).
   It reads the issuer test key from the walt.id profiles file at runtime
   (`WALTID_PROFILES` overrides the path).
3. **Unanym with the wallet path:** `UNANYM_EXP_DIR=/tmp/wallet-exp node experiments/wallet/unanym.js`
   (port 7010). `MAX_STATUS_AGE` and `STATUS_REFRESH_MS` set the freshness policy.
4. **Acceptance:** `npm run build && node experiments/wallet/acceptance.mjs` prints the
   evidence JSON and exits non-zero if any check fails.

## Same-browser completion

The back-channel response only stages a credential. It returns a one-time
`redirect_uri` to the wallet; that URI must return to the browser and account
session that opened the wallet. The member then selects **Add membership**.
The browser cookie, account-session binding, response code, request expiry and
POST origin are all checked before insertion or replacement. There is no endpoint
through which the request creator can poll for the response code. Opening a
forwarded request in another browser cannot silently attach a membership.
This experiment deliberately does not support cross-device completion. A human
using a phone wallet and the callback behaviour of other wallets remain untested.

## Two real WordPress pages

Keep the walt.id issuer/wallet running. Stop the standalone experimental Unanym
and organisation-status processes first: this rehearsal owns ports 7010 and 7012.
`WALTID_PROFILES` may point to the same fictional issuer profiles used above.

```sh
UNANYM_LAB_NAME=unanym-wallet-a UNANYM_WP_HOST=localhost UNANYM_WP_PORT=7082 UNANYM_DB_PORT=43508 bash scripts/wordpress/lab.sh start
UNANYM_LAB_NAME=unanym-wallet-b UNANYM_WP_HOST=127.0.0.1 UNANYM_WP_PORT=7083 UNANYM_DB_PORT=43509 bash scripts/wordpress/lab.sh start
npm run build
node experiments/wallet/wordpress.mjs
```

Only these labelled fictional installations are reset by the rehearsal. Existing
containers can be restarted with `docker start` after checking their label and
plugin mount; do not point the harness at a real website. Wait until WordPress
can read its database before rerunning. The harness creates temporary private
pages and identity data, then removes them and closes its own services/browser.
It writes sanitized results to `data/wallet-wordpress-evidence/wordpress.json`.
Stop the four dedicated WordPress/database containers after use.

The page tests cover both operator and website opt-in, mixed hosted and wallet
memberships, per-site withdrawal, credential replacement, organisation revocation
and a status-service outage. The outage bound is 20 seconds; real-time polling
adds at most one second of test tolerance, never another refresh interval.
Unit tests check the exact deadline without real-time polling.
