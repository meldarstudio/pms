# PMS

A pnpm workspace with a React portal, a Hono Cloudflare Worker, and shared Zod
schemas. The web toolchain uses Vite+ 1.3.0.

## Setup

Use Node 22.23.4, pinned in `.node-version`, and pnpm 11.22.0. With Vite+:

```sh
vp env install
pnpm install
```

pnpm checks the exact Node version before running scripts or `pnpm exec` commands.
If it reports a mismatch, run `vp env use 22.23.4` (or select that version with your
Node manager), then retry. It does not download Node automatically. When upgrading
Node, update both `.node-version` and `devEngines.runtime.version` in `package.json`.

Vite+ is a local dependency. A global `vp` installation is needed only for managing
Node and pnpm with `vp env`; project commands use the local dependency.

## Commands

Run these from the repository root.

| Command                                  | Behavior                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev` or `pnpm exec vp run dev`     | Start the portal and local backend                                         |
| `pnpm dev:portal` or `pnpm exec vp dev`  | Start the portal at `http://localhost:5173`                                |
| `pnpm dev:backend`                       | Start the local API at `http://localhost:8788`                             |
| `pnpm check`                             | Check repo formatting, then each package's lint and native types           |
| `pnpm exec vp test`                      | Run the backend and portal test projects                                   |
| `pnpm exec vp test --project portal`     | Run the portal tests only                                                  |
| `pnpm exec vp test --project backend`    | Run the backend tests only                                                 |
| `pnpm test` or `pnpm exec vp run test`   | Run the backend, then portal package test scripts                          |
| `pnpm format`                            | Format maintained source, configuration, and documentation across the repo |
| `pnpm build` or `pnpm exec vp run build` | Check the repo, then build the portal                                      |
| `pnpm exec vp -C apps/portal preview`    | Preview the portal production build                                        |

`vp dev`, `vp test`, and `vp build` are built-in tools. `vp run <task>` runs
the corresponding package script or configured task. The root configuration
selects the portal for application commands. Direct `vp build` does not run
the repository checks in the package's build script; use `pnpm build` for both.

Use `pnpm check` to validate and `pnpm format` to rewrite formatting. Separate
lint and typecheck scripts are intentionally omitted. Tests run separately;
`pnpm check` does not run tests or build the portal.

Production builds require `VITE_API_BASE_URL`:

```sh
VITE_API_BASE_URL=http://localhost:8788 pnpm build
```

The portal's development environment already points to the local backend.
The manual release workflow supplies the production API origin explicitly.

## Production releases

Follow the [release checklist](docs/releases.md) for exact-commit CI validation,
optional interactive migrations, deliberate API/portal deployment, automated
read-only smoke checks, and a short manual browser check. Version tags are optional.
Merging the workflow does
not disable existing automatic Workers Builds; confirm the documented cutover
before treating merges to `main` as deployment-free.

## Signing in

The portal and API require the staff login. Before the first `pnpm dev`, create
the local Worker variables:

```sh
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
pnpm auth:hash                  # prompts for a password, prints STAFF_PASSWORD_HASH
pnpm auth:hash --session-secret # prints a SESSION_SECRET
```

Paste both values into `apps/backend/.dev.vars`, then sign in at
`http://localhost:5173` with username `hotelmanantial` and that password. Restart
`pnpm dev:backend` after editing `.dev.vars`; Wrangler does not always reload it.
Use `localhost` for both the portal and the API. `127.0.0.1` is a different site, so
the browser will not send the session cookie.

## Testing

For test changes and code reviews, follow [the testing policy](CODING_STANDARDS.md#tests).
Run one backend file once with:

```sh
pnpm exec vp test run --project backend apps/backend/src/routes/reservations.test.ts
```

Run one portal file once with:

```sh
pnpm exec vp test run --project portal apps/portal/tests/reservation-forms.test.ts
```

These commands run from the repository root. Pass the file path directly, without
an extra `--` separator; that separator can cause the runner to ignore the file
filter and run the whole suite. Existing full-suite commands remain unchanged.

Tests run once by default; use `pnpm exec vp test watch --project portal` only
when you want a persistent watcher. Run affected files first, and run test commands
sequentially rather than launching separate test processes in parallel. Use the
full portal suite for the final validation of a frontend change.

The root runner executes test files serially across projects. Package-local portal
runs are also serial, and each portal fork has a 1.5 GiB JavaScript heap limit.
This bounds test concurrency and heap growth, not total system memory: Vite,
native allocations, and the coordinator use additional memory. Keep isolation
enabled; the UI harness installs browser globals and loads the real portal.

## Tool configuration

The root `vite.config.ts` owns formatting and test project selection. Each package's
`vite.config.ts` owns its lint rules, environments, exclusions, and native type
checks, reusing common lint defaults from `tooling/lint.ts`. The portal enables
React correctness rules at the package level.

Formatting uses Oxfmt defaults across maintained source, configuration,
and documentation, without Tailwind class sorting or package-specific styles.
Generated Worker types, Drizzle metadata, lockfiles, installed agent skills,
coverage, and package stores are excluded, along with Git-ignored files.
Linting covers portal TS/TSX files, backend TypeScript and JavaScript files,
and shared schemas, including tests and package configuration. Correctness
and TypeScript rules apply to all packages. React rules apply only to the
portal. Browser globals are limited to portal source and tests; Worker source
uses service-worker globals, and tests, backend scripts, and package configuration
use Node globals.
Generated Worker types, migrations, build output, and coverage are excluded.

`pnpm check` checks repository-wide formatting once, then runs each package's
`check` script serially. Package checks skip formatting and check only that
package's lint and native types. For targeted work, run
`pnpm --filter @pms/portal check` (or `@pms/backend` / `@pms/shared`). Run
`pnpm exec vp fmt apps/portal` to format only the portal.

Keep lint settings out of the root config: Vite+ gives a root lint block precedence
over package settings during `vp check`. Root `pnpm exec vp check .` is therefore
not equivalent to `pnpm check`; use the script for workspace validation. For
package-local type-only diagnostics, place flags before paths, for example
`pnpm exec vp -C apps/portal check --no-fmt --no-lint .`.

`pnpm check` enables Vite+'s native type checker with `typeAware: true` and
`typeCheck: true`. The portal's solution tsconfig references separate app,
Node configuration, and test projects. `tests/tsconfig.json` extends the strict
app options and adds Node types for the test runner. Tests remain outside the
app project's `src` include. Native checking covers all three projects.

The portal and backend share TypeScript 7 through the `typescript` catalog
entry in `pnpm-workspace.yaml`. Update that entry to upgrade both packages.
Vite+ uses its bundled TypeScript 7 checker for all three packages. You can also run the
installed compiler with `pnpm --filter @pms/portal exec tsc -b`; normal check
and build commands do not run that duplicate compiler pass.

Native checking also covers backend source, configuration, colocated TypeScript
tests, and shared schemas. `pnpm check` does not repeat the backend compiler
pass. The release workflow uses the same `pnpm check` command.
Backend `.mjs` scripts and tests receive syntax linting but are not type-checked.

Root `pnpm build` checks the entire repository before bundling the portal once.
`pnpm --filter @pms/portal build` checks only the portal before bundling it.

The shared package exports TypeScript source directly and needs no `vp pack`
step. Wrangler still handles backend development and deployment.

See [portal documentation](apps/portal/README.md) and
[backend documentation](apps/backend/README.md).
