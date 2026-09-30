# Local WordPress trial site

Use a separate fictional WordPress installation instead of adding test accounts
or identity plugins to a live site. The `unanym-trial` lab has its own database,
WordPress volume and companion plugin mounted from the candidate checkout.
Both HTTP and MySQL listen on loopback only.

## Create and check the site

From a clean candidate checkout with Docker, Node 24, PHP with Sodium and the
browser dependencies available:

```sh
npm ci
npm run build
npx playwright install chromium
UNANYM_LAB_NAME=unanym-trial UNANYM_WP_PORT=4402 UNANYM_DB_PORT=44306 \
  bash scripts/wordpress/lab.sh start
UNANYM_LAB_NAME=unanym-trial UNANYM_WP_PORT=4402 UNANYM_ISSUER_PORT=4400 \
  node scripts/wordpress/standalone-rehearse.js
```

The installer checks the downloaded plugin and WP-CLI hashes and uses pinned
WordPress and MySQL images. The rehearsal checks browser sign-in, explicit
sharing, a real private page, withdrawal, account linking, outage handling and
restore. Its report and screenshots are under
`data/unanym-trial-wordpress-lab/evidence/`. Keep that runtime directory private.
The identity service and captured sign-in codes exist only during the rehearsal;
no messages are delivered to real inboxes.

WordPress remains available at `http://localhost:4402` after the rehearsal. Its
native administrator is `lab-admin`, with the fictional password
`local-demo-only-2026`. These credentials are solely for this loopback lab.
The rehearsal removes its temporary private page and probe. Its identity
connection cannot work after the temporary host has stopped.

## Prepare a person to try the guide

The automated rehearsal is separate from the [WordPress setup trial](wordpress-trial.md).
Before giving that trial to another person, configure a persistent staging
identity service, verify real delivery to their authorised test inboxes, register
the callback, and hand over the site using the trial's prerequisite list. Clear
the rehearsal's connection settings first so the person attempts the setup.
Keep the installation local or behind agreed staging access controls; do not
publish this lab with its fictional credentials.

Another person has not completed the guide merely because this lab passes.
Keep their report separate from the automated evidence.

To pause the lab while retaining its data:

```sh
UNANYM_LAB_NAME=unanym-trial bash scripts/wordpress/lab.sh stop
```

Resume its two existing containers with:

```sh
docker start unanym-trial-wp-db unanym-trial-wp
```

The plugin mount refers to the checkout used to create the lab. Keep that
checkout available while using it.
