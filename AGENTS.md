# Unanym contributor instructions

- Unanym is independently runnable identity infrastructure. Keep community rules
  and actual receiving-site admission outside the core.
- `npm start` runs the standalone community-v1 host. Compatibility adapters and
  synthetic demos are separate; preserve their old wire formats.
- Keep explicit per-site consent, immediate access withdrawal and account linking.
  Never match people by display name or silently by email.
- Operator custody, organisation approval and organisation-held signatures are
  different. Do not claim training verification or interpersonal safety.
- Never commit real profiles, credentials, runtime data or private histories.
- Preserve vendor provenance. Run `npm run verify` for auth/consent changes and
  the dedicated WordPress rehearsal when that integration changes.
- Tests and local mock email do not establish live delivery or human acceptance.
- Publication and production operation require the owner's actual authorisation.
  The open acceptance items are in `docs/release-readiness.md`.

- Optional FRRN account host: FRRN is the sole writer of its membership approvals.
  Read only the versioned approval projection and explicitly authorised source
  bindings. Never backfill approval from open joining, invitations or local resource
  access. Keep legacy issuers on their existing contract.
- WordPress's supported basic member area is one selected private page, checked
  against current shared membership. Do not imply protection of public uploads,
  custom APIs or other plugins. Preserve native administrator access.
