# Production releases

One operator, one exact `main` commit, API then portal. Merge when ready; release
deliberately. The same developer may approve/ship; no release branch, version bump,
or tag is required. **This guide is not production authorization.**

## Normal release: choose, release, check

1. **Choose:** merge finished work and record the full 40-character SHA. Wait for
   its CI **push-to-main** run, not just PR CI. During development, run affected
   checks and exercise changes against local sample data. An ordinary release need
   not repeat all local validation: the workflow validates the selected commit.
2. **Migrate only if needed:** follow [Database changes](#database-changes-the-exception)
   before deploying code that needs a new schema.
3. **Release:** Actions → Release production → Run workflow → branch `main`,
   `commit_sha` set to that SHA; or from the repo root with `SHA` set:

   ```sh
   gh workflow run release.yml --ref main -f commit_sha="$SHA"
   ```

   The workflow installs pinned dependencies, checks/tests, builds the portal,
   bundles the API without deploying, and checks migration history read-only.
   It deploys API then the built portal, both every time. Later merges cannot
   change the selected source. Runs serialize without cancellation, but do not
   lock external deployments or migration terminals.

4. **Check and record:** wait for active-version verification. The Actions summary
   records SHA/run link, uploaded versions, active deployments, and outcomes.
   Save drafts and reload/update ordinary and installed-app windows. Check login,
   calendar/availability, and an existing reservation **without changing production
   records**. Record SHA/run link, browser results, migration names or "none," and
   applicable [PWA checks](portal.md#manual-pwa-verification) in the
   [private record](#private-evidence). Stop on any failure.

Only deployment **and** manual checks establish a verified release. Control-plane
active-version evidence does not prove serving behavior. There are no automated
HTTP checks of liveness, session rejection, or deployed portal content/types.
The workflow publishes no tag/release. Optional milestones target the exact verified
SHA with run link/migration names; never reuse, move, or delete published tags.

## Database changes: the exception

Prefer additive compatibility with the running API and old staff tabs/PWA windows;
backend-first alone does not make a breaking change safe. Remove old fields only
in a later separately approved release. A breaking handoff needs a coordinated
maintenance window, saved drafts, and both users' updates.

Before approving migrations, require successful push-to-main CI for the selected
SHA with checks, all tests, production portal build, and API dry-run. CI validation
does not access production or Cloudflare secrets. Migrate from a **clean checkout
of that SHA** with pinned Node/pnpm. For older commits lacking complete CI evidence,
validate locally from that checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
VITE_API_BASE_URL=https://api.hotelmanantialchurin.com pnpm build
WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false pnpm --filter @pms/backend exec wrangler deploy --dry-run --minify
```

Then follow the interactive migration procedure below. It applies **all pending
migrations in its checkout**; review [historical constraints](history/schema-rollouts.md)
for every pending transition. Coordinate one operator across machines and never
overlap migration/release runs. Skip if history is current. A release-readiness
failure is not pre-migration validation. Exports interrupt access and are not
restore-tested backups. Data loss requires separate approval/recovery planning;
never repair/bootstrap history merely to make deployment pass.

## Safe production migrations

From the repo root in an interactive terminal with Cloudflare access configured:

```sh
pnpm --filter @pms/backend run db:migrate:remote
```

This production-only command never deploys code. It:

1. Reads the target from [backend config](../apps/backend/wrangler.jsonc), requiring
   an existing nonempty ledger with known names in journal order. It neither
   creates nor repairs history; SQL files must match the journal.
2. Displays pending SQL/checksums, database identity, and downtime warning. Review
   compatibility with live code/data, then type `pms-production` to approve.
   No `--yes`, CI, or noninteractive bypass exists. With nothing pending it exits
   without prompting/exporting.
3. Exports SQL under `~/.pms-production-backups/` with private directories/owner-only
   files and a SHA-256 checksum in `report.json`. Failed/empty export blocks apply.
   Exports and migrations can interrupt access; choose the window first.
4. Applies approved migrations one at a time from private copies, rechecking files
   and live history before each. Require successful exit and a fresh ledger entry
   before continuing. Changed files/history stop the run.
5. Retains a private report of target, checksums, outcome, and sanitized diagnostics.
   Wrangler disk logs are disabled and child-output URLs redacted to avoid signed
   export-link retention. Backups/reports remain until deliberately deleted.

The `~/.pms-production-backups/migration.lock` excludes only cooperating runs under
the same home, not other machines/direct Wrangler. Existing backup directories must
be operator-owned `0700`. Before removing a crash-left lock, inspect PID/host/start
time and confirm nothing is running.

On failure, inspect the report and live ledger before retrying: earlier migrations
may have committed. `unknown`, or an interrupted `applying` report, requires
reconciliation. There is no automatic retry, restore, reset, or history repair.
Preserve schema/history for application rollback; use a reviewed forward repair
when incompatible. Restore can overwrite newer reservations/payments and always
needs separate authorization. Local validation proves neither remote locking,
outage duration, restoration, nor application behavior.

Migration checks compare ordered names; release readiness additionally requires
numeric IDs exactly `1...N` and the selected commit's exact registered history.
Investigate mismatches without bypassing the guard. Neither tool bootstraps a new DB.

## Failure and recovery

Stop at the first failure, including partial deployment. Interrupted commands can
have changed a Worker: inspect **both** live histories before retrying. Automation
does not roll back code, schemas, or data. Hotfixes follow the same release path.

- Transient failure: deliberately rerun the same SHA through all gates.
- Code defect: merge a fix and release its validated SHA.
- Unusable app: explicitly authorize rollback only after checking current schema
  and the API/portal pair. Exact-history guards prevent generic cross-history
  rollback; fix forward when unsafe.
- Data recovery: code rollback does not rewind data. Restore/Time Travel may erase
  newer legitimate work and requires a separate scoped decision/authorization.

Rehearse an existing backup into an isolated local database using the
[restore guide](backup-restore-rehearsal.md) before treating recovery as dependable.
Never rehearse on production; this is preparation, not a per-release requirement.

## Setup and deployment ownership

An existing database/valid ledger, authentication secrets, and custom domains are
prerequisites. Initial DB/ledger creation needs a separate reviewed operation.
Wrangler route entries attach domains in the `hotelmanantialchurin.com` zone;
preserve Workers, zone, bindings, vars, and secrets.

Keep Git-triggered Workers Builds disabled for **both Workers**, with no queued or
active automatic deployments: the release lock cannot serialize them. Reports
[below](#recorded-reports) are historical, not live configuration verification.

Repository Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`: account, not Worker/database ID.
- `CLOUDFLARE_READ_TOKEN`: account-scoped D1 Read for readiness.
- `CLOUDFLARE_DEPLOY_TOKEN`: account Workers Scripts Edit (including custom domains)
  and D1 Read for bindings; zone Zone Read and Workers Routes Edit for the property
  zone. Restrict production resources; add only needed binding permissions, not
  D1 Write or broad administration.

Expose tokens only to needed operations, never install/test/check/build. Keep the
existing Worker `SESSION_SECRET`; do not copy/rotate it for release setup. Credential
changes and the [account cutover](authentication.md#cutover-from-the-shared-password)
are separately authorized operations. Culqi code needs migration `0013` first; its
deployment starts cron. Taking payments/refunds additionally requires separately
authorized `CULQI_SECRET_KEY`; without it, calls fail and cron does no Culqi work.
See [0013 compatibility](history/schema-rollouts.md#culqi-payments-migration-0013).
[Future-stay coupons](reservations.md#future-stay-coupons) need migration `0014`
first; see [0014 compatibility](history/schema-rollouts.md#future-stay-coupons-migration-0014).
Local simulations do not establish token permissions.

## Workflow compatibility

Commits without verification scripts are rejected. If tooling changes, review both
the workflow dispatched from `main` and selected source: checkout does not replace
the already-running workflow definition.

## Recorded reports

These dated reports are not proof of current live state or production authorization.
Append non-sensitive results with provenance and verification limits; preserve older
records, explicitly superseding them when appropriate. Keep development backlogs elsewhere.

- **2026-10-22, operator report:** Git-triggered Cloudflare builds disconnected;
  not independently verified. Both Workers must stay disconnected for exclusive
  deliberate releases.
- **2026-10-23, documentation review:** no completed actual-backup rehearsal recorded
  and no private evidence inspected. Importability, completeness, remote restoration,
  and recovery duration unverified. Physical-device PWA validation and authenticated
  phone layout/touch/safe-area/desktop-scroll checks were not established. Live
  versions, migrations, tokens, and automatic-build settings were not inspected.
- **2026-10-26, read-only production phone audit:** an agent D1 SELECT checked 35
  contacts and 10 staying guests. With `libphonenumber-js` 1.13.15/default Peru,
  38 phones were structurally normalizable, 6 null, and one invalid eight-digit value;
  no extensions/annotations. D1 reported `rows_written: 0`, `changed_db: false`.
  No corrections, migrations, exports, or deployments. Private phone/query evidence
  is under `~/.pms-operations/audits/`, not a backup; reachability, intended country,
  deployed behavior, and recoverability were not verified.
- **2026-10-26, explicitly authorized production phone cleanup:** an agent D1 batch
  normalized 38 phones to E.164, cleared the invalid one, and left 6 nulls unchanged.
  Original phone/revision compare-and-swap guards preceded writes; contact revisions
  and 5 affected guest-reservation revisions incremented. Postflight matched exact
  phones/revisions (38 canonical, 7 null), with unchanged counts/schema/history.
  No people/reservations deleted, deployment, or migration. Original values,
  checksummed SQL, results, and guarded recovery SQL remain privately under
  `~/.pms-operations/phone-cleanups/`. Forward/restore and 4 stale/deleted abort cases
  passed local SQLite; remote restore/application behavior were not tested. These
  are targeted records, not a full backup; recovery needs separate approval and
  reconciliation of newer writes.

## Private evidence

The operator owns verification records. Use `umask 077`, owner-only directories
and files outside Git under `~/.pms-operations/`:

- `releases/<full-commit-sha>/<run-id>.md`: SHA/run link, observed Worker identities,
  migrations, manual login/calendar/PWA results, device/browser versions, failures,
  and checks not performed.
- `rehearsals/<date-and-id>.md`: source checksum/schema, independent expectations,
  timings, observed results, and scope limits from the restore guide.

These are conventions, not workflow automation. Actions keeps only its non-sensitive
summary; never put guest records/backup SQL in committed docs, summaries, or artifacts.
Existing SQL exports/reports stay under `~/.pms-production-backups/`; restore state
under `~/.pms-restore-rehearsals/`. Decide retention before operations; no automatic
cleanup or movement is implied. Retain source backups unless their specific deletion
is deliberately authorized.
