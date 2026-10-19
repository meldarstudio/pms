# Production releases

One operator, one selected `main` commit, API then portal. Release on demand;
the same developer may approve and ship. No release branch or package-version
update is needed. **This document is not authorization to access production.**

## One-time cutover (separately authorized)

- In Cloudflare, disable or disconnect **Git-triggered Workers Builds for both
  `pms-api` and `pms-portal`**. Wait for active builds to finish or explicitly stop
  them, then confirm neither can start another automatic production deploy.
  Preserve the existing Workers, custom domains, bindings, variables, and secrets.
  Merging this workflow does not change dashboard settings: until this cutover
  is confirmed, merging to `main` can still deploy production.
- Configure these repository **Actions secrets** for the existing production
  Cloudflare account (get identities/bindings from the package Wrangler configs):
  - `CLOUDFLARE_ACCOUNT_ID`: the account identifier, not a Worker or database ID.
  - `CLOUDFLARE_READ_TOKEN`: account-scoped **D1 Read**, for the readiness query.
  - `CLOUDFLARE_DEPLOY_TOKEN`: account **Workers Scripts Edit** (including custom
    domain attachment) and **D1 Read** (binding lookup); zone **Zone Read** and
    **Workers Routes Edit** for `hotelmanantialchurin.com`. Restrict account and
    zone resources to production; add only binding permissions actually required
    by Wrangler, not D1 Write or broad account administration.
- Keep tokens in secrets, never files committed to Git. They are exposed only to
  readiness/deploy steps, not install, checks, tests, or the portal build. Existing
  Worker `STAFF_PASSWORD_HASH` and `SESSION_SECRET` stay in Cloudflare: do not copy
  or rotate them for this setup. Local interactive migration authorization remains
  separate. Token permissions and actual cutover require authorized operational
  verification; local simulations cannot prove them.

## Each release

1. **Choose and validate.** Merge finished work into `main`, fetch it, and record
   an explicit full 40-character commit SHA. Use a clean detached checkout of
   that exact SHA (including this release workflow and readiness script), not an
   advancing branch. With the pinned Node/pnpm versions from that checkout, run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm check
   pnpm test
   VITE_API_BASE_URL=https://api.hotelmanantialchurin.com pnpm build
   ```

   All must pass **before approving release-specific migrations**. Exercise changed
   user workflows, especially reservation/payment writes, locally with sample data
   and the local API. A production build is validation, not permission to test
   writes in production. Review compatibility: ordinary API changes must support
   the previous portal, including open tabs and installed-app windows that defer
   updating; migrations must tolerate the currently running API. For a breaking
   change, coordinate a maintenance window with both users, finish/save drafts,
   and arrange both users' updates. Backend-first delivery alone is insufficient.

2. **Migrate only if needed.** Coordinate one operator across terminals/machines;
   never overlap an interactive migration with a release workflow. If history is
   already current, skip the interactive procedure. Otherwise, in that same clean,
   validated SHA checkout, review and run the existing [safe production migration
   procedure](../apps/backend/README.md#safe-production-migrations) in an interactive
   terminal. It applies **all pending migrations in its checkout**. Retain its
   confirmation, export, history checks, private reports, and downtime warnings.
   Exports interrupt database access and are **not restore-tested backups**.
   Destructive work requires separate data-loss approval and a recovery plan.

3. **Deploy deliberately.** In Actions → **Release production** → Run workflow,
   choose branch **main** and supply the recorded SHA in `commit_sha`. Equivalently:

   ```sh
   gh workflow run release.yml --ref main -f commit_sha="$SHA"
   ```

   The workflow rejects invalid/unavailable/unmerged SHAs, pins the checkout, and
   repeats installation, checks, the complete test suite, and the production portal
   build. Its read-only ledger check requires exactly the selected commit's
   registered migration history; missing, malformed, pending, newer, or different
   history blocks deployment. Investigate mismatches; the guard never migrates,
   bootstraps, or repairs history. Then code-only commands deploy **API first, then
   the already-built portal**, both on every release. Later merges do not change
   this attempt. Workflow concurrency serializes releases without cancelling an
   active run; it cannot lock a separate migration terminal.

4. **Verify read-only.** Successful commands mean uploads completed, not a verified
   release. Check the selected SHA, run logs/summary, and both Worker deployment
   histories. Update/reload the portal (including installed-app windows, after
   saving drafts), verify login, calendar/availability, and open an existing
   reservation **without changing any production record**. No runtime version
   endpoint is needed. If any check fails, follow recovery below, not step 5.

5. **Record the verified version.** Start with **`v0.1.0`** for the whole PMS; use
   patch for fixes, minor for features, major for deliberate breaking changes.
   A migration alone does not require a major. In GitHub Releases, publish a new
   release with a **new tag targeting the exact deployed SHA** (not the default
   branch tip). Notes need only a few change bullets, the workflow run link, and
   applied migration names (or “none”). Check that the tag is unused before
   publishing. Treat published tags as immutable: never move, reuse, or delete one;
   fixes receive a new version. The workflow has read-only repository permission
   and never creates tags/releases. Failed attempts remain in Actions history.

## Failure and recovery

Stop at the first failure. The summary distinguishes API and portal command
outcomes; a failed or interrupted command can still have changed its Worker.
Inspect **both live deployment histories** before any retry. No automated migration
retry, rollback, restore, or schema undo occurs. For a transient problem, deliberately
rerun with the **same SHA**, including validation/readiness gates. For a code bug,
merge a fix and release its newly validated SHA.

If users cannot work, explicitly approved application rollback is an option only
after checking compatibility with the current schema and the API/portal pair.
Exact-history readiness intentionally prevents using this workflow as a generic
rollback tool when history differs. Prefer a forward fix when rollback is unsafe.
Preserve reservations, payments, and applied migration history. Restoring an export
can erase work entered since it was taken and requires separate authorization.
