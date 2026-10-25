# Production releases

One operator, one exact `main` commit, API then portal. Merge when ready; release
deliberately. The same developer may approve and ship. No release branch or
package-version update is needed. **This document is not production authorization.**

## Normal release: choose, release, check

1. **Choose the code.** Merge finished work into `main` and record its full
   40-character commit SHA. Wait for that commit's **CI push-to-main run** to pass
   (not just its pull-request run). Run affected checks and exercise changed workflows
   locally while developing, using sample data. You do not need to repeat the
   entire local install/check/test/build sequence for an ordinary release: the
   release workflow validates the exact commit before deploying it.
2. **Skip migrations unless needed.** If the release changes the database, follow
   [Database changes](#database-changes-the-exception) first. Otherwise continue.
3. **Release.** In Actions → **Release production** → Run workflow, choose branch
   **main** and enter that SHA in `commit_sha`. Or, with `SHA` set to that commit:

   ```sh
   gh workflow run release.yml --ref main -f commit_sha="$SHA"
   ```

   The workflow installs pinned dependencies, runs checks and all tests, builds the
   production portal, bundles the API without deploying, and checks production
   migration history read-only. It then
   deploys **API first, then the already-built portal**. Both deploy every time.
   Later merges do not change the selected commit. Releases are serialized without
   cancelling an active run; this does not lock a separate migration terminal.

4. **Check and record.** Wait for active-version verification to pass. The
   run summary records the SHA, run link, both Workers'
   uploaded version/active deployment IDs, and step outcomes. Save drafts, then
   reload/update the portal, including installed-app windows. Verify login,
   calendar/availability, and an existing reservation **without changing production
   records**. Keep a short verification note with the SHA/run link, browser-check
   results, and applied migration names (or "none"). Save it in the
   [private release record](operations-status.md#private-evidence). If anything
   fails, stop and follow [recovery](#failure-and-recovery).

A release is verified only after deployment **and** the checks above succeed.
The workflow does not perform automated HTTP smoke checks: API liveness,
unauthenticated session rejection, and deployed portal file contents or content
types are not checked automatically. A successful workflow is not application
verification; complete and record the manual browser checks before calling the
release verified, including installed-app/update behavior where applicable.
Active-version checks are control-plane evidence at that moment, not an API
response identifying the serving code. Keep the manual browser check.

The commit SHA identifies the release. Numbered tags and GitHub Releases are
optional milestones, not a required publishing step. If publishing one, target
the exact verified SHA, use a new tag, and include the run link and migration
names. Never move, reuse, or delete published tags. The workflow does not publish
tags or releases.

## Database changes: the exception

Ordinary schema/API changes must work with both old and new code. Support staff
tabs and installed-app windows that have not updated; migrations must also work
with the currently running API. Remove old fields only in a later, separately
approved release. For a breaking handoff, arrange a short maintenance window with
both users, save drafts, and coordinate updates. Backend-first alone is not enough.

Before approving migrations, confirm the **exact selected SHA** has a successful
CI push-to-main run containing checks, all tests, the production portal build, and
the API dry-run. These CI steps do not access production or use Cloudflare secrets.
Then use a **clean checkout of that SHA**, with its pinned Node/pnpm versions, for
the migration. Do not use an expected release-readiness failure as validation or
start a deployment while migrations run.

For an older commit without complete CI evidence, validate locally instead:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
VITE_API_BASE_URL=https://api.hotelmanantialchurin.com pnpm build
WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false pnpm --filter @pms/backend exec wrangler deploy --dry-run --minify
```

Then review and run the existing [safe production migration
procedure](#safe-production-migrations) from that checkout
in an interactive terminal. It applies **all pending migrations in its checkout**.
Keep its SQL review, explicit confirmation, export, history checks, private
reports, and downtime warnings. Coordinate one operator across machines; never
overlap migration and release runs. If history is current, skip this operation. Review applicable
[historical rollout constraints](history/schema-rollouts.md) when upgrading an
older schema; a checkout can have several pending migrations.

Exports interrupt database access and are **not restore-tested backups**.
Destructive changes require separate authorization and a recovery plan; this
process does not authorize production data loss or rewriting applied migrations.
The release's ledger check requires exactly the selected commit's registered
migration history. Investigate any mismatch; never bypass the guard, bootstrap,
or repair history to make deployment pass.

## Safe production migrations

Run from the repository root in an interactive terminal, with Cloudflare access
already configured:

```sh
pnpm --filter @pms/backend run db:migrate:remote
```

This production-only command never deploys code. It:

1. Reads the target binding from [the backend config](../apps/backend/wrangler.jsonc) and queries the existing migration
   ledger without creating or repairing it. Missing or empty history, unknown names, or names out of journal order stop
   the run. SQL files must match the Drizzle journal.
2. Shows pending SQL, its checksums, the database name and ID, and the downtime
   warning. Review compatibility with the currently deployed Worker and all
   existing records. Type `pms-production` to approve the displayed work. There is
   no `--yes` bypass; CI and noninteractive execution are refused. With no pending
   migrations, it exits without prompting or exporting.
3. Exports SQL to a unique directory under `~/.pms-production-backups/`. The
   directory is private and files are owner-only from creation. Exporting
   interrupts database access; applying migrations may also interrupt requests.
   Choose an appropriate window before approving. Failed or empty exports block
   migration. A completed export receives a SHA-256 checksum in `report.json`;
   this is **not a restore-tested backup**.
4. Applies one approved migration at a time from private copies, checking the
   local files and remote history before each apply. A file or history change
   stops the run. Each migration must exit successfully and appear in a fresh
   ledger query before the next begins.
5. Reports the observed result and retains a private `report.json` with the target,
   migration and backup checksums, and sanitized diagnostics. Wrangler disk logs
   are disabled and child-output URLs are redacted so signed export links are not
   retained. Backups and reports remain until you explicitly delete them.

The command holds `~/.pms-production-backups/migration.lock` during the run. This
only excludes cooperating runs under the same home directory. Coordinate **one
operator at a time**, including other machines and direct Wrangler commands;
the lock is not distributed. If a crash leaves a lock, inspect its PID, host, and
start time and confirm no migration is running before removing that specific file.
Existing backup directories must be owned by the operator with mode `0700`.

On failure, stop and inspect the report. Earlier migrations may have committed.
The report lists newly observed ledger entries when postflight succeeds; an
`unknown` outcome means the command could not establish the final state. An
interrupted report still marked `applying` also needs investigation. Do not rerun
blindly: reconcile the live ledger first. There is no automatic migration retry,
restore, history repair, or database reset. Destructive changes need explicit
approval for their specific data loss and a separate recovery plan. A restore can
overwrite reservations or payments saved since the export and requires its own
authorization. Keep schema and applied history when rolling back application
builds where compatible; prepare a reviewed forward repair when needed.

Local validation does not prove remote locking, outage duration, restoration, or
application correctness. Perform the release's manual browser checks separately.

The wrapper compares ordered migration names; release readiness also requires
numeric ledger IDs exactly `1...N`. Passing migration validation alone does not
prove release readiness. Investigate mismatches without repairing history merely
to pass deployment. The wrapper cannot bootstrap a new database.

## Failure and recovery

Stop at the first failure, including a partial deployment. A failed or interrupted
command can still have changed its Worker: inspect **both live deployment
histories** before retrying. Automation does not retry migrations, roll back code,
restore data, or undo schemas. Hotfixes use the same checked release path, not a
laptop-deployment shortcut.

- **Transient problem:** deliberately rerun the same SHA with all validation gates.
- **Code bug:** merge a fix and release its newly validated SHA.
- **Users cannot work:** consider explicitly approved code rollback only after
  checking compatibility with the current schema and API/portal pair. The exact
  migration-history guard intentionally prevents generic rollback across different
  histories. Fix forward when rollback is unsafe.
- **Data recovery:** preserve reservations, payments, and applied migration history.
  Code rollback does not rewind the database. Restoring an export or using D1 Time
  Travel can remove legitimate work entered afterward; restoration always requires
  a separate decision and authorization, never an automatic release-failure action.

Before treating recovery as dependable, rehearse restoring a backup into an
isolated database and verify the recovered records using the
[backup restore rehearsal guide](backup-restore-rehearsal.md). Never rehearse on production.
This is recovery preparation, not a step required before every ordinary release.

## Setup and deployment ownership

This procedure assumes an existing production database with valid migration
history. Database creation and initial ledger bootstrap need a separately reviewed
and authorized plan; neither the release guard nor migration wrapper initializes
a new database. Existing authentication secrets and custom domains must be ready.
See [authentication](authentication.md) for separately authorized credential changes.
The configured custom domains require the `hotelmanantialchurin.com` zone on the
Cloudflare account. The package Wrangler route entries attach those domains on
deployment; preserve the existing zone, Workers, and bindings during release setup.

Keep Git-triggered Workers Builds disabled for **both `pms-api` and `pms-portal`**, with no queued or
active automatic deployments. GitHub's release lock cannot serialize external
deployments. Preserve existing Workers, domains, bindings, variables, and secrets.

Check [dated operational reports](operations-status.md) for prior confirmations.
A report does not establish the current live configuration.

The existing workflow uses these repository Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`: account identifier, not a Worker or database ID.
- `CLOUDFLARE_READ_TOKEN`: account-scoped **D1 Read** for the readiness query.
- `CLOUDFLARE_DEPLOY_TOKEN`: account **Workers Scripts Edit** (including custom
  domain attachment) and **D1 Read** (binding lookup); zone **Zone Read** and
  **Workers Routes Edit** for `hotelmanantialchurin.com`. Restrict resources to
  production; add only required binding permissions, not D1 Write or broad account
  administration.

Keep tokens in secrets, never committed files. Expose them only to the operations
that need them, not installation, tests, checks, or builds. Existing Worker
`STAFF_PASSWORD_HASH` and `SESSION_SECRET` stay in Cloudflare; do not copy or rotate
them for release setup. Migration authorization remains separate. Token permissions
require authorized operational verification; local simulations do not prove them.

## Workflow compatibility

Use this workflow with commits that contain its verification scripts; older
commits without them are rejected before deployment. If CI or deployment tooling
changes, review the workflow dispatched from `main` as well as the selected source:
checking out a commit does not replace the already-running workflow definition.
