# PMS

A property-management system with a React portal, a Hono Cloudflare Worker, and
shared Zod schemas in a pnpm workspace. Agents start with [AGENTS.md](AGENTS.md),
then read the relevant topic guide.

## Setup

Use Node from [.node-version](.node-version) and pnpm from `package.json`'s
`packageManager`. With global Vite+, run `vp env install`, then `pnpm install`.
Otherwise select those versions with your Node/package manager. Project commands
use local Vite+; global `vp` is only needed for `vp env`.

pnpm rejects a Node version mismatch; it does not download Node automatically.
Use `vp env use` or your Node manager before retrying. When upgrading Node, update
both `.node-version` and `devEngines.runtime.version` in `package.json`.

## Commands

Run from the repository root:

| Command                                | Behavior                                                         |
| -------------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                             | Start portal (`localhost:5173`) and local API (`localhost:8788`) |
| `pnpm dev:portal` / `pnpm dev:backend` | Start one application                                            |
| `pnpm check`                           | Check repository formatting, then package lint and native types  |
| `pnpm test`                            | Run backend, then portal tests                                   |
| `pnpm exec vp test --project portal`   | Run only portal tests (`backend` selects backend)                |
| `pnpm format`                          | Rewrite maintained source, config, and documentation formatting  |
| `pnpm build`                           | Check the repository, then build the portal                      |
| `pnpm exec vp -C apps/portal preview`  | Preview the portal production build                              |
| `pnpm culqi:sandbox`                   | Exercise API payment flows with Culqi sandbox keys               |

`pnpm check` does not run tests or build. Direct `vp build` skips the repository
checks; use `pnpm build` for both. The root Vite+ configuration selects the portal
for application commands. Wrangler handles backend development and deployment;
the shared package exports TypeScript source without a separate build.

Production builds require a build-time API origin:

```sh
VITE_API_BASE_URL=http://localhost:8788 pnpm build
```

The committed development environment points at the local API; the manual release
workflow supplies the production origin.

## Signing in

Before the first `pnpm dev`, create local Worker variables and accounts:

```sh
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
pnpm auth:secret
pnpm db:migrate:local
pnpm auth:account hotelmanantial --role=staff --local
pnpm auth:account <owner-username> --role=owner --local
```

Paste the generated `SESSION_SECRET` into `.dev.vars`, then sign in at
`http://localhost:5173` with the password you entered. Restart `pnpm dev:backend`
after editing `.dev.vars`; Wrangler may not reload it. Use `localhost` for both
applications: mixing it with `127.0.0.1` prevents session cookies being sent.
See [authentication](docs/authentication.md) for roles and password management.

Load [sample data](#local-sample-data) for a fresh local database, or configure
an empty property through [Property setup](docs/property-setup.md).

## Local sample data

These commands target disposable local D1, need no Cloudflare credentials or
running Worker, and run from the repository root:

```sh
pnpm db:reset:local
pnpm db:reset:local --rebuild-schema
pnpm db:reset:local --date=2026-10-06 --persist-to=/absolute/path/to/pms-demo
```

A plain reset applies migrations, replaces application data, and preserves schema,
triggers, migration history, and accounts. `--rebuild-schema` drops PMS tables,
triggers, and the ledger, then reapplies registered migrations and sample data;
it preserves unrelated tables and Cloudflare metadata, but **drops accounts**.
Recreate them with the [sign-in setup](#signing-in). Neither command rewrites migrations.

The deterministic dataset includes assigned/unassigned and multi-room stays,
payments, rate overrides, and closures. Scenarios live in
[seed-data.mjs](apps/backend/scripts/seed-data.mjs); rooms/types come from
[seed.sql](apps/backend/seed.sql). Reset with the same reference date to reproduce
the data, then refresh the portal to discard edits. `pnpm db:seed:local` only adds
missing rooms/types; `pnpm db:migrate:local` applies migrations without deleting data.

The seed defaults to UTC today, while the app uses the property date. Pass `--date`
for date-sensitive checks; old reference dates can disable new-booking actions.
Use `CI=true` for noninteractive local migration confirmation. With `--persist-to`,
start Wrangler with that same absolute directory; otherwise reset uses the normal
local backend state. For isolated browser checks, also choose unused ports and
matching [API origin/CORS settings](docs/portal.md#api-environment). Mutate only local data.

## Testing

Follow [the testing policy](CODING_STANDARDS.md#tests). Run one file once with:

```sh
pnpm exec vp test run --project backend apps/backend/src/routes/reservations.test.ts
pnpm exec vp test run --project portal apps/portal/tests/reservation-forms.test.ts
```

Pass the path directly, without an extra `--`, which can cause the file filter to
be ignored. Tests run once by default; use `pnpm exec vp test watch --project portal`
for a watcher. Run affected files first and test commands sequentially. Use the
full portal suite for final validation of a frontend change.

The root runner serializes files across projects. Portal package runs are also
serial, with a 1.5 GiB heap limit per fork—not a total system-memory limit. Keep
isolation enabled because the UI harness installs browser globals. Package test
environments live in [backend instructions](apps/backend/AGENTS.md#test-environment)
and [portal instructions](apps/portal/AGENTS.md#test-environment).

## Tool configuration

- Root [vite.config.ts](vite.config.ts) owns formatting and test projects. Package
  `vite.config.ts` files own lint and native type checks, sharing
  [tooling/lint.ts](tooling/lint.ts). Read those files for rules and exclusions.
- Keep lint settings out of the root config: Vite+ gives them precedence over
  package settings. `pnpm exec vp check .` is not equivalent to `pnpm check`.
- Formatting uses Oxfmt defaults, without Tailwind class sorting. Installed skills
  and generated artifacts are excluded. [The local no-comments rule](tooling/no-comments.mjs)
  allows only reference, TypeScript, and lint-disable directives in code.
- `pnpm check` checks formatting once, then packages serially. Target a package with
  `pnpm --filter @pms/portal check` (or `@pms/backend` / `@pms/shared`); it skips
  formatting. Format a subtree with `pnpm exec vp fmt apps/portal`.
- Type checking uses Vite+'s native checker, covering portal app/config/tests,
  backend TypeScript/config/tests, and shared schemas. Backend `.mjs` is linted,
  not type-checked. Normal checks do not repeat a `tsc` pass. TypeScript and Zod
  versions live in [pnpm-workspace.yaml](pnpm-workspace.yaml).
- Type-only flags go before paths: `pnpm exec vp -C apps/portal check --no-fmt --no-lint .`.
  `pnpm --filter @pms/portal build` checks only the portal before bundling.

## Production releases

Use [the release checklist](docs/releases.md): exact-commit validation, separately
authorized migrations, API then portal deployment, active-version verification,
and a manual browser check. There are no automated HTTP smoke checks. Keep Workers
Builds disabled for both Workers. Dated reports are [historical evidence](docs/releases.md#recorded-reports),
not proof of the live configuration.

## Topic guides

- [Authentication](docs/authentication.md): sessions, accounts, credentials.
- [Reservations](docs/reservations.md): pricing, payments, commands, concurrency, editors.
- [Calendar, dates, and assignment](docs/calendar.md): operational dates, calendar reads, physical rooms.
- [Property setup](docs/property-setup.md): room types, numbering, occupancy.
- [Housekeeping](docs/housekeeping.md): manual room readiness and marking.
- [Portal](docs/portal.md): shared UI behavior, API environment, PWA/offline safety.
- [Releases](docs/releases.md) and [backup restore rehearsal](docs/backup-restore-rehearsal.md): operations and recovery.

[GLOSSARY.md](GLOSSARY.md) owns business terms; [the domain guide](docs/agents/domain.md)
routes architectural decisions. [Historical schema rollouts](docs/history/schema-rollouts.md)
preserve compatibility constraints without claiming deployment status.
