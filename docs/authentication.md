# Authentication

Every route except `GET /` and `POST /login` requires a session. Sign-in uses
[Better Auth](https://www.better-auth.com) with sessions stored in D1
([ADR 0002](adr/0002-better-auth-with-database-sessions.md)). There are two accounts:

- the **Staff account** (`hotelmanantial`, role `staff`), shared by the staff;
- the **Owner account** (role `owner`).

Both roles can do everything in the portal. Only the owner can manage accounts.
Usernames are matched without regard to letter case. Changes are not recorded
against an account.

- The app keeps its own routes and calls Better Auth on the server. Better Auth's
  HTTP handler is not mounted, so there is no sign-up or other built-in endpoint.
- `POST /login` takes `{ username, password }` and sets the `pms.session_token`
  cookie on local HTTP, or `__Secure-pms.session_token` on HTTPS. The cookie is
  `HttpOnly`, `SameSite=Lax`, host-only on the API hostname (same-site with the
  portal), and `Secure` on HTTPS. Sessions last 30 days and extend while in use.
- Successful login and `GET /session` return `{ username, role, propertyTimeZone }`.
  `POST /logout` ends the session in the database.
- Logins are limited to 5 per minute per IP by the `LOGIN_LIMITER` rate limit binding.
- `ALLOWED_ORIGINS` is a comma-separated list of exact origins allowed to send
  credentialed requests. Production sets it in `wrangler.jsonc`. Local dev overrides it
  in `.dev.vars`.
- `SESSION_SECRET` signs the cookie. If it is missing, the Worker fails closed:
  guarded routes and login return 401 and the Worker logs the cause. Rotating it
  signs everyone out.
- The Worker needs the `nodejs_compat` flag for Better Auth and its native password
  hashing.

Owner-only routes answer 403 `owner account required` for the Staff account:

- `GET /accounts` lists `{ id, username, role }`.
- `PUT /accounts/:id/password` takes `{ password }`, sets another account's password,
  and signs that account out everywhere. The owner cannot use it on their own account.
- `PUT /account/password` takes `{ currentPassword, newPassword }` and signs the owner
  out of their other sessions. A wrong current password answers 400 with
  `X-Error-Field: currentPassword`.

New passwords are 12 to 128 characters. The Staff account cannot change any password.

Backend tests create both accounts the way the account script does and sign in through
the real login route (`apps/backend/src/test-support/auth.ts`). They do not bypass
the guard.

## Creating accounts and resetting passwords

The account script creates an account, or replaces an existing account's password
and role and signs it out everywhere. It prompts for the password twice and rejects
passwords outside the 12–128-character range before changing credentials or sessions.

```sh
pnpm auth:secret                                     # prints a new SESSION_SECRET
pnpm auth:account hotelmanantial --role=staff --local
pnpm auth:account <owner-username> --role=owner --local
```

`--local` writes to the local D1 database (add `--persist-to=PATH` for another
state directory). `--remote` writes to production and asks you to type the username
to confirm: run it only for an explicitly authorized production credential change.

When someone leaves, the owner sets a new staff password in Configuración → Cuentas (or
with the script) and tells the remaining staff. If the owner password is lost, reset
it with the script.

## Cutover from the shared password

Production previously checked one shared password against the `STAFF_PASSWORD_HASH`
secret, with the username in the `AUTH_USERNAME` var. Moving to accounts is a
separately authorized production operation:

1. Apply migration `0005_accounts` with the
   [safe production migration procedure](releases.md#safe-production-migrations).
2. Create the Staff account with the current staff password and the Owner account:
   `pnpm auth:account hotelmanantial --role=staff --remote`, then the owner.
3. Deploy the API and portal following the [release checklist](releases.md).
   Everyone signs in once more.
4. Delete the old secret:
   `pnpm --filter @pms/backend exec wrangler secret delete STAFF_PASSWORD_HASH`.

## Portal sessions

`AuthGate` in `apps/portal/src/components/auth-gate.tsx` wraps the router. It asks the API for
the session and shows the login form when there is none. Every request sends
`credentials: "include"`. A 401 from any API call clears cached data and shows the
login form again, keeping the current URL, so signing in returns to the same page.
Backend login and account errors are translated in `apps/portal/src/lib/errors.ts`.

The Owner account sees **Cuentas** inside Configuración
(`apps/portal/src/components/accounts.tsx`), listing real usernames and opening a
focused form to set the staff password or change its own password. The Staff
account cannot open the section; see [Configuración routing](property-setup.md#portal-setup).
The first read keeps section headings visible with accessible loading placeholders.
Failed refreshes keep an open password draft on screen with a stale-data warning
and retry action; see [portal error states](portal.md#error-states). Local navigation,
router navigation, and unload protect password drafts. Password controls are disabled
during writes; failed changes retain the draft and successful changes clear it.
No password draft is stored in browser storage.

See [local credential setup](../README.md#signing-in) before development,
[the property calendar](property-calendar.md) before changing session metadata,
and [release prerequisites](releases.md#setup-and-deployment-ownership) before production setup.
