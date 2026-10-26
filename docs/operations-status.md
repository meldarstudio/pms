# Operational status and evidence

This file records dated reports and verification limits. It is not evidence of
the current live configuration or authorization to perform a production operation.
Use [the release procedure](releases.md) for operational steps.

## Recorded reports

- 2026-10-22: The operator reported disconnecting Cloudflare Git-triggered builds.
  The previous release guide recorded this as operator confirmation, without
  independent verification. Both Workers must remain disconnected from automatic
  builds for deliberate releases to be exclusive.
- 2026-10-23 documentation review: The existing guides recorded no completed
  rehearsal with an actual backup. No private evidence was inspected during this
  review. Importability, record completeness, remote D1 restoration, and recovery
  duration remain unverified by this review.
- 2026-10-23 documentation review: The prior portal guide reported no physical-device
  validation for the installed-app implementation. The assignment guide also left
  phone layout, scrolling, safe areas, touch interaction, and desktop row scrolling
  awaiting authenticated visual validation. This review did not run those checks.
- 2026-10-23 documentation review: Live migration history, deployed versions, token
  permissions, and current automatic-build settings were not inspected. The
  [historical rollout notes](history/schema-rollouts.md) do not establish whether
  those transitions have been completed in production.
- 2026-10-26 read-only production contact-phone audit: An agent-run remote D1
  `SELECT` inspected 35 booking-contact records and 10 staying-guest records in
  `pms-production`. With `libphonenumber-js` 1.13.15 and Peru as the default for
  numbers without `+`, 38 phones were structurally valid and could be normalized,
  6 were null, and 1 eight-digit value required manual review. No extensions or
  annotated values were found. D1 reported `rows_written: 0` and
  `changed_db: false`. No data corrections, migrations, exports, or deployments
  were performed. This does not verify reachability, intended country, deployed
  application behavior, or recoverability. Phone-only evidence and the query were
  retained privately under `~/.pms-operations/audits/`; they are not a database backup.
- 2026-10-26 authorized production contact-phone cleanup: Following that audit and
  explicit operator approval, an agent-run D1 query batch normalized 38 phones to
  E.164 and cleared the single invalid eight-digit phone to null. The 6 existing
  nulls were left unchanged; no people or reservations were deleted. Original
  phones and revisions were checked before applying compare-and-swap updates;
  contact revisions and the 5 affected staying-guest reservation revisions were
  incremented. Postflight reads matched the exact phone/revision plan: 38 valid
  canonical phones and 7 nulls, with unchanged record counts, schema, and migration
  history. No application deployment or schema migration was performed. Original
  values, checksummed SQL, results, and guarded recovery SQL remain private under
  `~/.pms-operations/phone-cleanups/`. Forward updates, phone restoration, and 4
  stale/deleted-record abort cases passed in local SQLite; remote restoration and
  application behavior were not tested. These targeted records are not a full
  database backup; any recovery requires separate approval and reconciliation of
  newer writes.

After an authorized operation, append a dated, non-sensitive result identifying
the operator or evidence source and exactly what was verified. Distinguish an
operator report from independent verification. Preserve previous reports as
history; a newer report can explicitly supersede one. Keep implementation tasks
and code-level limitations in their relevant guide or issue, rather than treating
this file as a development backlog.

## Private evidence

The operator performing an authorized operation owns its verification record.
Keep sensitive notes outside the repository under `~/.pms-operations/`:

- `releases/<full-commit-sha>/<run-id>.md` for the SHA, Actions run link, observed
  Worker deployment identities, migration names, manual login/calendar/PWA checks,
  browser/device versions, and failures or checks not performed.
- `rehearsals/<date-and-id>.md` for the source backup checksum and schema, independent
  expectations, import/check timings, observed results, and scope limitations from
  [the rehearsal guide](backup-restore-rehearsal.md).

Create the directory and notes privately with `umask 077`; directories must be
owner-only and files must be owner-readable/writable only. These paths are a
recordkeeping convention, not an automation implemented by the release workflow.
The workflow still writes its non-sensitive Actions summary. Never copy guest
records or backup SQL into that summary, committed docs, or Actions artifacts.

Existing SQL exports and migration reports stay under
`~/.pms-production-backups/`. Isolated restore state stays under
`~/.pms-restore-rehearsals/`. This convention does not move or delete either.
Before an operation, the operator must decide the required retention and cleanup
for its private evidence and rehearsal state. Retain source backups unless their
specific deletion is deliberately authorized; do not introduce automatic cleanup.
