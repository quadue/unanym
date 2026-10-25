# Account procedures

Adopted by the operator on 25 October 2026, for the first pilot. The standalone
service has no screens for these actions. The operator carries them out on the
account database by hand, or with the deletion script for sections 3 and 4. Each procedure says who may ask, what evidence is needed,
the exact change, and what is recorded.

## Rules for every procedure

- **Never merge accounts.** A matching name, a similar email address or a
  claim to be the same person never joins two accounts. If the new address
  already has an account, stop and explain the options to the member.
- **The organisation's word is evidence, not authority over the account.** An
  organiser can confirm they know the person. They cannot ask for a change to
  someone else's account.
- **Two people when possible.** A second responsible person reviews the case
  record before the change is made. Until that person is appointed, the
  operator records that the change was made without a second review.
- **Keep a private case record** outside this repository: a case reference,
  dates, who asked, what evidence was seen, who confirmed it, who made the
  change and who reviewed it. Do not copy message contents or email addresses
  into the database audit; use the case reference.
- **Back up first.** Stop the service, take a backup, make the change, start
  the service, and check that the member can sign in.

### Making a database change

On the host, as the service user:

```sh
S=/space/services/unanym-standalone
pm2 stop unanym-standalone
cd $S/current
IDENTITY_DATA_DIR=$S/data IDENTITY_CLIENTS=$S/clients.json \
  IDENTITY_CLIENT_SECRETS=$S/client-secrets.json \
  node scripts/backup.js $S/backups/case-<ref>
sqlite3 $S/data/accounts.db
```

Inside `sqlite3`, run the procedure's statements between `BEGIN;` and
`COMMIT;`. If any check returns something unexpected, run `ROLLBACK;` and stop.
Then `pm2 start unanym-standalone`. In the statements below, `:operator` is the
operator's account ID (`SELECT account FROM operators;`) and timestamps use
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`, the format the service writes. Set each
`:name` before the transaction, quoting text values, for example
`.parameter set :case_ref "'case-2026-001'"`. The statements in sections 1 and
2 were exercised against a disposable installation on 24 October 2026; the
member kept their account and memberships after an email change, and a new
organiser could withdraw an approval made by the previous one.

## 1. A member has lost access to their mailbox

**Who may ask:** the member, through the contact form, from the new address
they want to use.

**Evidence, strongest first:**

1. **A passkey.** If the account has a passkey, ask the member to sign in with
   it while on a call with you, then check that its `last_used` time has just
   changed:
   `SELECT name,last_used FROM passkeys WHERE account=:id;`
2. **An organiser who knows them.** On a video call, an organiser of a
   community the account belongs to confirms that the person is that member.
   The organiser must reach you through their own organiser email, not through
   the member.

In both cases, also prove the new mailbox: send a short random phrase to the
new address, and have the member read it back on the call.

An account with no passkey and no memberships has nothing to vouch for it. Do
not change its email. The member can start a fresh account with the new
address. Their websites will see a new identifier, so they reconnect or ask
each website to link the new identity.

**Wait before changing.** Unless the old mailbox is believed to be in someone
else's hands, wait seven days after the request and send a notice to the old
address: "A change of email for your Unanym account was requested. If this
was not you, reply through the contact form." Any objection stops the case.

**The change:**

```sql
BEGIN;
SELECT id FROM accounts WHERE email=:new_email;          -- must return nothing
SELECT id,email FROM accounts WHERE id=:account;          -- the right account
UPDATE accounts SET email=:new_email WHERE id=:account;
DELETE FROM sessions WHERE account=:account;
INSERT INTO audit(at,actor,action,organisation,target,detail)
  VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now'),:operator,'email_changed_by_operator',NULL,:account,:case_ref);
COMMIT;
```

The member then signs in with a code sent to the new address. Their website
identities, sharing choices and memberships stay with the account.

**If the old mailbox was taken over,** make the change without waiting. Then
review the account's passkeys and remove any the member does not recognise:
`SELECT id,name,created FROM passkeys WHERE account=:account;`, then
`DELETE FROM passkeys WHERE id=:passkey;` for each one. Tell the member's
organisers, because approvals may have been shared with websites in the
meantime.

## 2. Handing over an organiser role

**Who decides:** the community, following its own rules. The outgoing
organiser alone cannot appoint a successor, and the operator never chooses one.

**Evidence:** a written appointment through the channel agreed with the
network. It names the new organiser and the person or group who decided.
Confirm it with someone other than the new organiser, for example the outgoing
organiser or the network's steering group.

**Steps:**

1. The new organiser signs in once at `/identity/login` with their own email,
   which creates their account.
2. Add them as an administrator:

   ```sql
   BEGIN;
   SELECT id FROM organisations WHERE id=:organisation;
   SELECT id FROM accounts WHERE email=:new_organiser_email;   -- gives :new
   INSERT INTO administrators(organisation,account) VALUES(:organisation,:new);
   INSERT INTO audit(at,actor,action,organisation,target,detail)
     VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now'),:operator,'administrator_added',:organisation,:new,:case_ref);
   COMMIT;
   ```

3. Keep both organisers for up to 14 days, so they can hand over open
   approvals. Then remove the outgoing organiser:

   ```sql
   BEGIN;
   DELETE FROM administrators WHERE organisation=:organisation AND account=:old;
   INSERT INTO audit(at,actor,action,organisation,target,detail)
     VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now'),:operator,'administrator_removed',:organisation,:old,:case_ref);
   COMMIT;
   ```

Approvals the outgoing organiser made stay valid. They were the organisation's
approvals, not personal ones. The new organiser can withdraw any of them.

**Urgent removal.** If an organiser's account may be compromised, or the
community or steering group asks for immediate removal, remove the role at once
with step 3 and end their sessions (`DELETE FROM sessions WHERE account=:old;`).
Then send the organisation a list of approvals and withdrawals made in the
period in question. Reverse them only on the organisation's instruction.

**No organiser left.** If the last organiser leaves without a successor, the
organisation keeps its existing approvals until they expire or the community
appoints someone. The operator does not approve or withdraw members in its
place.

## 3. Deleting an account on request

**Who may ask:** the account holder, through the contact form.

**Evidence:** send a short random phrase to the account's email address and
ask the requester to send it back through the contact form. That shows they
control the account's mailbox.

**Before deleting:** tell the member that deletion ends every website
connection, that websites keep what they already received, and that their
organisers will see the membership disappear.

**Delete:** find the account ID (`SELECT id FROM accounts WHERE email=...;`
with the account's address). Then, with the host stopped and a backup taken,
run:

```sh
IDENTITY_DATA_DIR=$S/data node scripts/delete-account.js \
  --account <account-id> --case <ref> --list $S/operations/deletions.tsv
```

The script refuses operator accounts and organisers (hand over the role first).
It adds the account ID, time and case reference to the deletion list before
deleting anything, then removes the account, its sign-in codes, sessions,
passkeys, memberships, website identities, connections and grants. Organisation
audit records stay. Copy the updated list to the second machine (section 4),
start the host, and check that the email address can start a fresh, empty
account.

## 4. Restoring from a backup

Backups can contain accounts deleted since they were taken. The deletion list
holds only account IDs, times and case references, no email addresses. Keep it
outside the data directory, and after every deletion copy it to a second
machine that does not depend on this host's backups. A restored host holds a
list as old as its backup, so always use the newest copy.

After any restore, and before the service is reopened, delete those accounts
again, giving the backup's date:

```sh
IDENTITY_DATA_DIR=$S/data node scripts/delete-account.js \
  --replay <newest deletions.tsv> --since <YYYY-MM-DD>
```

If it reports an account that organised a community, redo that handover from
the case records. Record in the case notes that the replay was done. Accounts
removed by the automatic unused-account sweep are not listed; the host removes
them again when it starts.
