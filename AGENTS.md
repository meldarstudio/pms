# AGENTS.md

## Safety

- Production is live. Preserve production data and applied migration history. Local sample data is disposable; production is not.
- Run deployments, remote migrations, and production secret changes only for an explicitly requested production operation. A schema change in a development task is not deployment authorization.
- Feature branches merge to `main`, which deploys production. Prepare required production migrations before the code that needs them is deployed.
- Keep credentials in local ignored environment files or Cloudflare secrets, not committed files.

## Toolchain and validation

- Use pnpm, not npm or npx. Run project commands from the repo root unless a task-specific instruction says otherwise. Use the Node version in `.node-version` and pnpm version in `package.json`.
- Before development, test, build, or check commands, read [README.md](README.md#commands). It owns command usage and environment setup.
- Before changing tests or reviewing code, read [CODING_STANDARDS.md](CODING_STANDARDS.md). Run affected tests and `pnpm check` for code changes; checks do not run tests.
- Before changing formatting, lint, or compiler configuration, read [README.md](README.md#tool-configuration). Root `vite.config.ts` owns formatting and lint rules.
- Keep TypeScript and Zod dependencies as `"catalog:"`; use the APIs of the versions in `pnpm-workspace.yaml`.

## Task-specific context

Read the applicable instructions before changing the package or contract, including callers in other packages:

- **Backend/API:** [apps/backend/AGENTS.md](apps/backend/AGENTS.md) for Hono routes, authentication, reservation workflows, and database-backed behavior.
- **Portal/UI:** [apps/portal/AGENTS.md](apps/portal/AGENTS.md) for routing, forms, queries, API clients, and UI components.
- **Database:** [docs/agents/database.md](docs/agents/database.md) before changing schemas, migrations, triggers, seeds, or deploying schema-dependent code.
- **Shared schemas:** `packages/shared` (`@pms/shared`) supplies backend request schemas. The portal maintains its own schemas and API types; check both sides when changing a contract.
- **Domain/architecture:** [docs/agents/domain.md](docs/agents/domain.md) before exploring domain concepts or architectural decisions; it points to the shared glossary and ADRs.
- **Issues/specs:** [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) before tracker operations. Use GitHub Issues in `meldarstudio/pms`.
- **Triage:** [docs/agents/triage-labels.md](docs/agents/triage-labels.md) before triaging incoming issues.

## Cross-package contracts

- Business dates are timezone-free `YYYY-MM-DD` labels; UTC calendar arithmetic preserves those labels. Operational today comes from the backend's `PROPERTY_TIME_ZONE`, supplied to the portal by login/session metadata. Stay nights and room closures use `[start, end)`; rate ranges include both ends. A stay cannot exceed 60 nights.
- Money is integer cents. Currency comes from the Worker's `CURRENCY` var (`PEN`).
- Backend error messages stay English. Add each new message's Spanish translation to `apps/portal/src/lib/errors.ts`, including authentication and database-conflict errors.
- API request or response changes must update the portal's hand-written types and fetch helpers in `apps/portal/src/lib/api.ts` and affected query hooks in `apps/portal/src/lib/queries.ts`.
