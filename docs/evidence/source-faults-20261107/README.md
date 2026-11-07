# A closed source and a stepped-down organiser

7 November 2026, against FRRN `afc4b3a` with fictional data. Nothing here ran on a
live service.

## What changed

- A closed source, or a missing pause file, now answers `503`
  `temporarily_unavailable` at UserInfo and the token endpoint. It used to answer
  `401` `invalid_token`, the same as a deleted account, so WordPress ended the session.
- A source binding problem no longer stops the host. A former organiser's earlier
  approvals keep counting, as they already did on a running host, and the host logs
  the binding for review.

## Evidence

- `frrn-wordpress.json`: the real-WordPress rehearsal on `/identity/v1`, 10 of 10,
  with real FRRN forms. The closure step runs once while WordPress polls UserInfo and
  once while it must refresh an expired token.
- Control: with the `findAccount` check removed, the same rehearsal stops at that
  step and no earlier. WordPress had ended the session and showed a `200` login page.
- `npm test` 69 of 69, Playwright 17 of 17, `npm run check:release` passes.
- Seven deliberate mutations of the change each failed a test, including using the
  library's own `TemporarilyUnavailable`, which is a `400`.

## Limits

This proves a synthetic software chain. It is not a real organisation, a real mandate
or a member trial. While a source is closed, a connected member sees "temporarily
unavailable" on every page of the website until it reopens; WordPress's native
administrator sign-in is unaffected. That is the plugin's existing outage behaviour.
