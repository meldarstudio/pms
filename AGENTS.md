# AGENTS.md

## Safety

- Production is live. Preserve production data and applied migration history. Local sample data is disposable; production is not.
- Run deployments, remote migrations, and production secret changes only for an explicitly requested production operation. A schema change in a development task is not deployment authorization.
- Feature branches merge to `main`. Prepare required production migrations before deploying code that needs them.
- Keep credentials in local ignored environment files or Cloudflare secrets, not committed files.

## Toolchain and validation

- Use pnpm, not npm or npx. Run project commands from the repo root. Use the Node version in `.node-version` and pnpm version in `package.json`. Root `package.json` scripts are the command reference.
- Before changing tests or reviewing code, read [CODING_STANDARDS.md](CODING_STANDARDS.md). Run affected tests and `pnpm check` for code changes; checks do not run tests.
- Root `vite.config.ts` owns formatting; package configs own lint and type checks.
- Keep TypeScript and Zod dependencies as `"catalog:"`; use the APIs of the versions in `pnpm-workspace.yaml`.

## Database

- After editing `apps/backend/src/db/schema.ts`, run `pnpm db:generate` to append a migration. Never edit, consolidate, or regenerate applied migrations, snapshots, or journal entries.
- Hand-written trigger changes go in a new migration registered in `apps/backend/drizzle/meta/_journal.json`. Tests execute journal entries, so an unregistered migration is untested.
- Destructive production migrations, resets, or database replacement require explicit approval for the specific data loss.

## Task-specific context

- **Backend/API:** [apps/backend/AGENTS.md](apps/backend/AGENTS.md).
- **Portal/UI:** [apps/portal/AGENTS.md](apps/portal/AGENTS.md).
- **Shared schemas:** `packages/shared` (`@pms/shared`) supplies backend request schemas. The portal maintains its own schemas and API types; check both sides when changing a contract.
- **Domain/architecture:** [docs/agents/domain.md](docs/agents/domain.md); terms live in [GLOSSARY.md](GLOSSARY.md).
- **Issues/specs:** [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md). Use GitHub Issues in `meldarstudio/pms`.
- **Triage:** [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Documentation

Code is the docs. Don't add prose guides; put knowledge in names, types, and tests. See [CODING_STANDARDS.md](CODING_STANDARDS.md#documentation).

## Cross-package contracts

- Business dates are timezone-free `YYYY-MM-DD` labels; UTC calendar arithmetic preserves those labels. Operational today comes from the backend's `PROPERTY_TIME_ZONE`, supplied to the portal by login/session metadata. Stay nights and room closures use `[start, end)`; rate ranges include both ends. A stay cannot exceed 60 nights.
- Money is integer cents. Currency comes from the Worker's `CURRENCY` var (`PEN`).
- Backend error messages stay English. Add each new message's Spanish translation to `apps/portal/src/lib/errors.ts`, including authentication and database-conflict errors.
- API request or response changes must update the portal's hand-written types and fetch helpers in `apps/portal/src/lib/api.ts` and affected query hooks in `apps/portal/src/lib/queries.ts`.
