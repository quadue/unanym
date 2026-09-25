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
   - disable the wallet's `auth` feature and point its persistence at a private Postgres.

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
