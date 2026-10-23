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
