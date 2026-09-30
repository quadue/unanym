# WordPress setup trial

**Status: prepared, not conducted.** This trial checks whether another person can
connect a staging WordPress site using the published guide. Automated checks
already cover the software; this trial records what a person finds difficult.

Use fictional memberships and ordinary test accounts. Keep the site and identity
service separate from production. A [separate local WordPress lab](wordpress-local-trial.md)
is available for automated checks. The independent tester and persistent identity
service with real mail delivery still need to be arranged. Preparing this guide
has not invited anyone or established a successful human trial.

## Prepare the handoff

The operator prepares a working staging identity service and an appointed test
organisation administrator. For the choir example, call the organisation
Riverside Choir. The operator gives the tester:

1. The staging WordPress address and an existing administrator account.
2. The [website setup guide](websites) and the current companion plugin download.
3. The operator's name and agreed private channel for registration and support.
4. The organisation ID and the identity service's sign-in address.
5. A private way to receive the client ID, client secret and membership-key
   fingerprint after supplying the exact WordPress callback.
6. Test inboxes controlled by the participants, with code delivery checked before
   the session. Use fictional display names; do not load a real member list.

The tester needs an administrator account to configure WordPress. The organiser
uses a separate account to approve memberships. The member uses a separate browser
profile. Keep existing WordPress administration available throughout the trial.

If the service, mail delivery or registration handoff is missing, mark the trial
**blocked** and record which prerequisite is missing. Do not count captured mail
or a preconfigured site as proof that the tester completed those steps.

## Tasks for the website administrator

Give these goals to the tester. Let them use the [website guide](websites), but
do not explain each screen in advance.

1. Install both plugins and ask the operator to register this staging website.
2. Save the connection, check its key fingerprint with the operator, and select
   the organisation this website recognises.
3. Create a private page called Rehearsal notes containing fictional text. Select
   it as the member area, requiring Riverside Choir membership.
4. Check that a signed-out visitor cannot read that page. Confirm that ordinary
   WordPress administration still works.
5. Use the [member guide](members) to connect as Robin. Choose a name and share
   the choir membership. Open the rehearsal page.
6. Return to sharing choices and withhold the choir membership. Reload the page;
   it should deny access. Share the membership again and check that access returns.
7. Ask the organiser to withdraw approval using the [organiser guide](organisers).
   Reload the rehearsal page; access should close on that request.
8. Have the organiser approve again, reconnect with the membership selected, then
   disconnect this website in Your places. Check that the website session ends
   and the member page cannot be opened using that connection.
9. Create an ordinary existing WordPress test subscriber with a distinct email.
   Sign in to that account normally and link Unanym from its profile. Confirm
   that it remains the same WordPress account, with the same role and email.

Never try account linking with the native administrator account. The existing
subscriber test is separate from new-member sign-in; do not merge accounts by
name or email.

## Ask the member to explain

Without prompting, ask the member:

- What did the choir website receive? What did it not receive?
- Who can see connections across websites?
- Where would you change sharing or disconnect?
- What happens to rehearsal notes already copied after access ends?

Record their words before explaining the answer. A successful click does not
establish that the person understood what was shared.

## Record the result

Download the [blank trial report](templates/wordpress-trial-report.md). Record
the exact source revision, plugin ZIP checksum, WordPress/PHP versions, tasks
completed, time spent and each point where assistance was needed. Distinguish
setup failures, confusing guidance and differences caused by the site's plugins
or cache. Record the smallest follow-up for each problem.

Use participant aliases and remove addresses, secrets, codes, cookies and private
member details from notes and screenshots. Keep the completed report in the
agreed private location, not this source repository or a public issue.

Leave the result as **not conducted** until a person has actually attempted it.
If assistance was needed, report that explicitly. This trial does not replace
independent security review, an actual organisation mandate or an operator's
separate backup-and-restore trial. The companion protects one selected private
page; public uploads and other plugins require their own access rules.
