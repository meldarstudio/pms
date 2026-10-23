# Backup restore rehearsal

Practice recovering an existing export into a **new local database**, never
production. This checks whether the SQL can be imported and the expected records
recovered. It does not prove remote D1 restoration, outage duration, or application
compatibility. See [operational status](operations-status.md) for recorded
rehearsal evidence and unresolved limits.

This is occasional recovery preparation, not a per-release step. Repeat after
significant changes to the schema or backup procedure. Remote rehearsals, new
production exports, and production recovery require separate authorization.

## 1. Choose and protect the backup

Use an existing `database.sql` and its `report.json` from a migration backup under
`~/.pms-production-backups/`. Do not take a new production export just for this
guide: exporting interrupts database access. Treat all exports, imported state,
query output, and notes as private guest/payment data; never commit or upload them
to Actions artifacts.

Check that the export is nonempty and compare `shasum -a 256 /absolute/path/to/database.sql`
with `backup.sha256` in its report. Record the source database identity, export
time, checksum, and the schema/migration history represented by the export. A
pre-migration export contains the **old** schema, not necessarily current `main`.
For meaningful verification, have independent expected counts and representative
reservation/payment details from that backup's point in time; current production
can legitimately differ. A checksum proves file identity, not record completeness.
The migration report records target, history, diagnostics, and a checksum; it does
not capture application counts or representative record expectations. Obtain
those independently within the scope of an authorized operation and keep them
private. If they are unavailable, import/integrity checks alone leave record
completeness unverified.

## 2. Import into isolated local state

Use the repo's pinned Node/pnpm versions. In one terminal, create a private directory
outside the repository and an explicit rehearsal-only Wrangler configuration:

```sh
umask 077
mkdir -p "$HOME/.pms-restore-rehearsals"
chmod 700 "$HOME/.pms-restore-rehearsals"
REHEARSAL_DIR="$(mktemp -d "$HOME/.pms-restore-rehearsals/rehearsal.XXXXXX")"
cat > "$REHEARSAL_DIR/wrangler.jsonc" <<'JSON'
{
  "name": "pms-restore-rehearsal",
  "compatibility_date": "2026-10-08",
  "send_metrics": false,
  "d1_databases": [{
    "binding": "RESTORE_DB",
    "database_name": "pms-restore-rehearsal",
    "database_id": "00000000-0000-0000-0000-000000000000"
  }]
}
JSON
```

Set `BACKUP_SQL` to the absolute path of the verified export, then run from the
repo root, in that same terminal:

```sh
BACKUP_SQL=/absolute/path/to/database.sql
WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false pnpm --filter @pms/backend exec wrangler d1 execute RESTORE_DB --local --config "$REHEARSAL_DIR/wrangler.jsonc" --persist-to "$REHEARSAL_DIR/state" --file "$BACKUP_SQL"
```

**Keep `--local`, the rehearsal config, and the private persistence path in every
command.** The all-zero ID is a local placeholder, not the production database ID.
Do not change production bindings, run migrations over the imported backup, or
reuse the application's normal local database. Stop on any import error; a partial
import is not success. Use a fresh rehearsal directory for another attempt.

## 3. Verify and record the result

Run local read-only checks against the same database:

```sh
WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false pnpm --filter @pms/backend exec wrangler d1 execute RESTORE_DB --local --config "$REHEARSAL_DIR/wrangler.jsonc" --persist-to "$REHEARSAL_DIR/state" --command "PRAGMA quick_check; PRAGMA foreign_key_check; SELECT id, name FROM d1_migrations ORDER BY id; SELECT COUNT(*) AS reservations FROM reservations; SELECT COUNT(*) AS payments, COALESCE(SUM(amount_cents), 0) AS payment_cents FROM payments;"
```

Require a successful import, `quick_check` returning `ok`, no foreign-key violations,
and migration history/counts/totals matching the independent expectations. Compare
representative records too: reservation codes and statuses, guest relationships,
stay dates, saved nightly prices, room assignments, and payment amounts/dates.
Adapt read-only queries to the backup's schema; do not modify history to make the
checks pass. If expectations are unavailable, mark completeness **unverified**.

Save a [private rehearsal note](operations-status.md#private-evidence) with the checksum, selected source/schema, tool versions,
elapsed import/check times, expected versus observed results, and failures or
limitations. Only mark the rehearsal successful for the scope actually verified.
Record that it was **local**, not a tested remote production-recovery procedure.
Retain or explicitly remove that specific rehearsal directory according to your
retention decision recorded by the operator; do not casually delete the source backup.

Production recovery is a separate incident decision: preserve newer legitimate
writes and applied migration history, assess code/schema compatibility, and obtain
explicit authorization for the target and any data that could be overwritten.
