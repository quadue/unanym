# Privacy at unanym.org

Draft updated 24 October 2026. Not yet approved for publication. Before
publishing, the operator confirms the items below, then removes this heading
block so the notice starts at "Who runs this service".

- Mavie.uk is the correct legal name of the controller, and the postal address
  is current.
- Contact: the contact form and postal address are the published routes; no
  email address is published.
- The Cloudflare R2 bucket's storage location.
- How long contact messages are kept in the Mavie.uk mailbox (12 months below).
- The deletion and post-restore procedures in
  [account procedures](account-procedures.md) are adopted.

## Who runs this service

Mavie.uk operates unanym.org and is responsible for the personal information
held by this installation. Contact us through the [contact form](https://unanym.org/contact), or
write to Mavie.uk, 2 South Park Avenue, NR4 7DU, United Kingdom.

This notice covers the Unanym public website, its contact form and its hosted
sign-in service. Each website you connect has its own operator and privacy
notice.

## What we keep and why

We use your email to send sign-in codes and let you return to your account.
We keep your account identifier, creation date, verification state and the date
you last signed in. If an organisation administrator approves you, we also keep
the organisation, approval, expiry, withdrawal and any separately recorded
introduction confirmation. An administrator may enter your email before you
first sign in.

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

Our web server records each request for seven days: the network address, time,
requested page and its address parameters, and the response. These logs help us
investigate faults and abuse. They do not include cookies, other request headers
or form contents.

Our basis for running and securing the requested account service is our
legitimate interest in reliable sign-in, preventing abuse and preserving the
website accounts and sharing choices you rely on. Organisation administrators
are responsible for the purpose and lawful basis of their membership records.
Sharing choices control disclosure; they do not authorise unrelated uses.

## The contact form

If you use the contact form, we receive your email address, the message, and
your name and community if you give them. This website does not store them: it
sends them by email to the Mavie.uk mailbox so we can reply, which is our
legitimate interest in answering you. To limit abuse, the site holds your
network address in memory for up to a day and then forgets it. We keep messages
in the mailbox for up to 12 months after the conversation ends, unless they
become part of an agreement with your community.

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

These providers process information for us:

| Provider | What it does | Where |
| --- | --- | --- |
| ITP-Solutions | Hosts the service and its data | Frankfurt, Germany |
| Cloudflare | Carries web traffic, including network addresses and request details; stores encrypted backups (R2) | Global network; Cloudflare, Inc. is in the United States |
| Brevo | Delivers sign-in codes and contact-form messages | France |
| Tuta | Holds the Mavie.uk mailbox that receives contact-form messages | Germany |
| Heart Internet | Hosts a separate server holding encrypted backups | United Kingdom |

The UK recognises the European Economic Area as giving adequate protection.
Transfers to Cloudflare in the United States rely on its data processing
addendum and the safeguards it incorporates.

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
the account is maintained. An account that has never held a community membership,
an organiser or operator role, or a website connection is deleted automatically
after 12 months without a sign-in, with its passkeys, sessions and passkey
history. There is no self-service account deletion today, and accounts that were
used are not removed automatically. Ask us through the contact form to delete
your account; disconnecting one website is a different action and retains your
earlier sharing history.

Backups are made daily. The server keeps the two most recent unencrypted copies
for quick recovery. Encrypted copies are kept for up to about six months: seven
daily, four weekly and six monthly copies. Deleting live data therefore does not
erase it from older backups straight away. If we ever restore from a backup, we
first repeat every deletion made since that backup, so deleted accounts do not
come back.

## Cookies and your choices

Unanym uses necessary sign-in, session and request-binding cookies. You can sign
out, remove passkeys, change what each website receives, or disconnect a website
from your account. Disconnect stops future access through that connection;
contact the receiving website about information it already received.

There is no advertising, marketing tracker or page analytics script. Cloudflare
processes security and network data to deliver and protect the site.

## Your rights and contact

Use the [contact form](https://unanym.org/contact) to ask for access, a copy, correction, deletion
or restriction of your information. We may need to verify the requester's
identity without asking for more than is needed. You can object to processing
based on legitimate interests. You can stop future sharing with a website in
your account. We consider requests under the applicable data-protection rules;
we do not automatically refuse deletion because a record is signed.

Unanym verifies sign-in and sharing choices. Each receiving website makes its
own admission decisions. Contact that website about its decision and records.

You can complain to the [Information Commissioner's Office](https://ico.org.uk/make-a-complaint/)
in the UK. You can contact us first, but do not have to.
