# Two WordPress sites, one community

An automated rehearsal with fictional people, two actual WordPress installations,
separate databases/client registrations, and separately signed-in administrators.
The same agent operates them; this is not evidence of independent human usability,
real email delivery, a community mandate, or real-world adoption.

## Run

Use Node.js 24+, Docker and a FRRN checkout containing community introductions.
Install dependencies in both checkouts first. From Unanym:

```sh
FRRN_APP_ROOT=/path/to/frrn npm run simulate:wordpress
```

The runner builds both applications. It creates or reuses only the labelled
fictional `unanym-frrn` and `unanym-second` WordPress labs. Their site ports are
4342 and 4343; the temporary FRRN/Unanym service uses 4340 and 4341. The databases
listen only on loopback at 43308 and 43436. Test credentials are local fixtures.
It resets only those labs' identity settings and fictional subscriber accounts;
do not use these labelled labs for any other work. It refuses a plugin mount from
another source checkout and stops the containers it started when finished.

The FRRN application reads a newly created temporary database. It never opens a
checkout's runtime database. No real email is sent, and no live website is changed.
Evidence and screenshots are written under ignored
`data/unanym-frrn-wordpress-lab/evidence/`. The temporary service/database is removed
after the run; the stopped, fictional WordPress volumes remain reusable.

## What is exercised

- A hidden community receives a request. Pending requests cannot open the page.
- An organiser approves membership using the FRRN form once.
- Robin shares membership and signs in at the international example website.
- The same person uses `R.` at the local website. Its choices start blank.
- Withholding at one site leaves the other site usable.
- Separate consent opens both private pages; names, subjects and website keys
  differ. No email is shared. A statement cannot be replayed at the other site.
- The organiser separately confirms a community introduction. The member must
  choose to share it, and WordPress independently verifies and displays it.
- Withdrawing that confirmation removes the display, without removing membership.
- Withdrawing membership closes both private pages on their next request.
- Disconnecting one website leaves the other usable. Cancelling a sharing change
  leaves the existing permission intact. A phone can display the connections page.
- Anonymous page, search, feed and REST responses do not expose the member page.
  Disabling the companion leaves it private. Native administrators retain access.

The separate standalone rehearsal also checks email-code forms with captured
mail, existing-account linking, service failure, renewal, two restored service
instances, preserved choices and persistent withdrawal. Neither local rehearsal
proves an independent operator can restore the system unaided.

## Human trial still needed

Give a volunteer organiser and two website administrators the published guides.
Observe whether they can register the source and sites, approve a member and
select a private page. Give members these tasks, without explaining the screens:

1. Join the community and open its page on the first website.
2. Choose a different name on the second website; share only what it needs.
3. Find out which organisation confirmed the introduction, and choose whether
   to share it. Check whether they understand that membership is separate.
4. Change one sharing choice, then disconnect only that website.
5. Return to the other website and confirm it still works.

Record assistance needed, confusing words, mistaken expectations and failed
tasks. In particular, test operator registration/setup: a successful member
screen does not establish that volunteers can configure the system easily.
