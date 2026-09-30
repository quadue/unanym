# Repository and release workflow

The private Gitea repository is the canonical source. `origin` points to it and
`main` is the reviewed candidate branch. The optional `github` remote is a
secondary copy; it is not the release authority. Moving source does not change
an identity issuer, signing key, account mapping or live service.

## Verify a candidate

Work on a branch and open an ordinary pull request against `main`. The pinned
workflow in `.gitea/workflows/verify.yml` runs for pushes to `main` and the public
landing branch, and for pull requests against `main`. Other branches can use
workflow dispatch or a pull request. The GitHub workflow remains available for
an optional secondary copy.

The Gitea job uses the runner's `ubuntu-latest` label, Node 24 and the locked npm
dependencies. `scripts/ci-php.sh` uses installed PHP with Sodium when available.
On the Debian 12 non-root runner, it extracts Debian's PHP verifier and Sodium
library into a fresh job-local directory. It does not install system packages
or require Docker, sudo, production secrets or a deployment credential. Chromium
is downloaded into the runner's ordinary browser cache; its system libraries
are provided by the runner image.

Verify performs the tracked-file boundary and vendor checks, build, Node tests
and browser tests. Keep a successful run linked to the exact candidate commit.
The separate real-WordPress rehearsal is required when WordPress integration
changes. Gitea workflow files are explicitly allowed by the release check;
unreviewed Gitea configuration and private deployment references remain excluded.

For a local review from a clean checkout:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
npm ci
npx playwright install chromium
npm run verify
```

Local verification needs PHP with Sodium or the documented Docker fallback.
Do not switch branches or overwrite a checkout containing someone else's edits.
Use a separate worktree or clone for a clean candidate review.

## Bring reviewed work onto main

Before advancing `main`, record its previous revision and preserve a rollback
branch. Verify the candidate, then merge through the reviewed pull request or
fast-forward when the existing main is an ancestor and that update is authorised.
Never force-push over another contributor's work. Confirm the new remote main
revision and its Gitea Verify result after the push.

The source merge does not deploy a service. A deployment needs its own exact
revision, preserved running configuration and rollback plan. Keep public
documentation and account-host deployments distinct; neither an HTTP response
nor a successful source push establishes a real member journey.

## Record acceptance separately

The [release checklist](release-readiness.md) retains the independent-review and
real operator/member gates. Use the [WordPress trial](wordpress-trial.md) and its
[blank report](templates/wordpress-trial-report.md) for the staging handoff.
Keep completed reports and participant information privately. CI can verify
fictional software journeys; it cannot fill in a human trial result.
