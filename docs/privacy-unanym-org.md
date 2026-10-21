# Privacy at unanym.org

Draft prepared 21 October 2026. Not yet approved for publication: confirm the
hosting and backup locations, processor arrangements and retention procedure
listed in the release preparation note.

## Who runs this service

Mavie.uk operates unanym.org and is responsible for the personal information
held by this installation. Write to hello@mavie.uk or Mavie.uk,
2 South Park Avenue, NR4 7DU, United Kingdom.

This notice covers the Unanym public website and its hosted sign-in service.
Each website you connect has its own operator and privacy notice.

## What we keep and why

We use your email to send sign-in codes and let you return to your account.
We keep your account identifier, creation date and verification state. If an
organisation administrator approves you, we also keep the organisation,
approval, expiry, withdrawal and any separately recorded introduction
confirmation. An administrator may enter your email before you first sign in.

For each connected website, we keep a separate identifier and signing key,
the name you chose, your sharing choices and their history. These let you
return to the same website account and inspect or stop its access. The service
operator holds these keys and can connect your records across websites.

If you add a passkey, we keep its public key, your label for it, an opaque user
handle, device and backup flags, and creation and use dates. Your authenticator
keeps the private passkey. We do not receive your fingerprint or face scan.

We keep sessions, sign-in challenges, approval and sharing records, and account
update read markers to operate and protect the service. Security limits use IP
addresses briefly in memory and keyed hashes of email/IP buckets in the account
database. Sign-in codes are stored as keyed hashes, not readable codes.

Our basis for running and securing the requested account service is our
legitimate interest in reliable sign-in, preventing abuse and preserving the
website accounts and sharing choices you rely on. Organisation administrators
are responsible for the purpose and lawful basis of their membership records.
Sharing choices control disclosure; they do not authorise unrelated uses.

## Who receives information

A connected website receives its own identifier, your chosen name if requested,
and only the current memberships or confirmations you choose to share from
those it requests. Membership and introduction statements are signed by the
service operator. A new statement discloses the approval or confirmation day,
rather than its precise time. Organisations and dates you disclose can still
make you recognisable across sites.

An organisation's authorised administrators can manage its own membership and
introduction records. They do not receive a list of your other organisations
or connected websites. Membership itself does not give a website access until
you choose to share it.

Cloudflare handles web traffic, which includes network addresses and request
details. Brevo delivers sign-in email and receives the delivery address and
message. Hosting providers store the service data. Encrypted backups are copied
to Cloudflare R2 and a separate backup server. Provider locations, contracts and
any international transfer safeguards must be confirmed before this draft is
published.

## How long records remain

An email code expires after ten minutes, with at most five guesses. Account
sessions expire after 24 hours. Expired code, session and hourly request-limit
records are removed by the running service's periodic cleanup. Browser passkey
challenges expire after five minutes and are cleaned up; removing a passkey
removes its stored public credential.

Website access tokens and membership statements last at most five minutes;
refresh access lasts at most seven days and can end sooner. Expiry ends their
validity. It is not a promise that every expired protocol row is immediately
erased from storage.

Account, approval, per-website identity and sharing-history records remain while
the account is maintained. There is no automatic inactive-account deletion or
self-service account deletion today. Contact hello@mavie.uk to request deletion;
disconnecting one website is a different action and retains your earlier sharing
history. We must agree and document a bounded operational retention and erasure
procedure before approving this notice for publication.

Backups rotate under the host's daily, weekly, monthly and yearly policy.
Deleting live data does not immediately erase an older backup. The maximum
backup age and a procedure preventing restoration of deleted data must be
confirmed before publication.

## Cookies and your choices

Unanym uses necessary sign-in, session and request-binding cookies. You can sign
out, remove passkeys, change what each website receives, or disconnect a website
from your account. Disconnect stops future access through that connection;
contact the receiving website about information it already received.

There is no application advertising or marketing tracker. Cloudflare may process
security and network data under its service settings. Edge analytics settings
need checking before this notice makes any broader tracking promise.

## Your rights and contact

Contact hello@mavie.uk to ask for access, a copy, correction, deletion or
restriction of your information. We may need to verify the requester's identity
without asking for more than is needed. You can object to processing based on
legitimate interests. You can stop future sharing with a website in your account.
We consider requests under the applicable data-protection rules; we do not
automatically refuse deletion because a record is signed.

Unanym verifies sign-in and sharing choices. Each receiving website makes its
own admission decisions. Contact that website about its decision and records.

You can complain to the [Information Commissioner's Office](https://ico.org.uk/make-a-complaint/)
in the UK. You can contact us first, but do not have to.
