# Webmaster questions

Unanym connects community websites with member-controlled identities and
recognised memberships. Each community keeps its rules; each person chooses what
to share. The current package is a pilot candidate, not a supported production
release. Hosting and support arrangements are agreed with your service operator.

## What does our website gain?

Members use one sign-in across participating websites and choose which approved
memberships each site receives. Your website keeps its own content, accounts and
admission rules. It does not receive access to a shared member database.

## Do we need to rebuild our website?

No. For WordPress, install OpenID Connect Generic Client and the Unanym companion
on a staging copy. Your operator registers the callback address and supplies the
connection settings. Members see **Continue with Unanym**, or the name configured
by your operator. Start with [the WordPress setup](standalone.md#wordpress).

## What happens to existing accounts?

Members sign in to their existing WordPress account first, then connect it from
their profile. Their content, roles and email remain. Accounts are never merged
by matching names or emails. Members without a local account become Subscribers.
There is no automatic migration of another community platform's accounts.

## Who approves memberships?

Each organisation appoints authorised administrators. An administrator approves
or revokes that organisation's memberships; each website decides which
organisations it recognises. Local, national and international organisations do
not automatically inherit authority over one another.

The current statement is signed by the identity service operator and reports
the recorded administrator approval. It is not signed with an organisation-held
key and does not prove training, qualifications or personal safety.

## Can we set our own access rules?

Yes. The ready-made member area currently protects **one selected private
WordPress page requiring one selected organisation membership**. Additional
tiers, combined requirements and other membership plugins need separate work
and testing. Membership never automatically grants an administrator role.

## What information do we receive?

Your website receives its own stable identifier for the member, their chosen
name and the memberships they selected, with verification information. It does
not receive their sign-in email, other website connections or unselected
memberships. The [contract](contracts/community-v1.md) lists the exact fields.

## Can we still send members email?

Existing WordPress accounts keep their email. New members can add an email
directly to your website if they want messages from it. The identity service
does not share it automatically. Plugins that require email need their own test.

## Are members anonymous?

They can use a pseudonym and withhold unnecessary information from your website.
The identity operator holds account records and keys and can link their website
identities. Shared names or details may also make them recognisable to websites.
This is not complete anonymity.

## Are our files and other member pages protected?

The tested integration protects the selected page's content. Uploaded PDFs,
public media links, other pages, directories, forums, custom APIs and other
plugins need their own access policy. Caches must bypass private and signed-in
pages. Disabling the companion leaves the selected page private.

## What happens after withdrawal or disconnection?

The hosted path checks current membership on connected requests. Withdrawing
approval or withholding a required membership closes access on the next checked
request. Disconnecting ends the connected session. Neither deletes the local
WordPress account nor recalls material already downloaded. Logout is separate
from withdrawing sharing permission.

## What if the identity service is unavailable?

New sign-ins and sessions connected through the service can be blocked until it
recovers. Public pages remain available to signed-out visitors. Ordinary
WordPress administrator sign-in stays usable. Agree support, backups and recovery
with the operator before relying on the service.

## Do members need an app or wallet?

No. The first supported journey uses browser sign-in. Wallets, personal keys and
alternative storage are optional development work, not requirements for members.

## Who holds the data and handles privacy requests?

The identity operator holds account, approval and sharing records. Your website
holds local accounts and received information. Before a pilot, agree the actual
hosting locations, responsibilities, retention, deletion and recovery process.
A consent screen alone does not establish data-protection compliance.

## Can another operator take over?

Unanym runs independently. Backup and restore have been rehearsed with fictional
data. A handover must preserve the issuer address, account identifiers, keys and
withdrawals. Changing the issuer needs explicit website-account migration.
Independent operator handover still needs acceptance; source access alone is
not an operational support plan.

## Is it ready, and what does it cost?

Automated rehearsals use real local WordPress installations and fictional
members. Real-member acceptance and independent security review remain pending.
The source repository is currently private. Pricing, hosting, maintenance,
incident response and support commitments are not settled by this package;
agree them explicitly with the proposed operator.
