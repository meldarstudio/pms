# Authentication

Every route except `GET /` and `POST /login` requires a session cookie. There is one
shared Staff account. Its username is the `AUTH_USERNAME` var in [the backend config](../apps/backend/wrangler.jsonc)
(`hotelmanantial`, matched without regard to letter case).

- `POST /login` takes `{ username, password }`, checks the password against the
  `STAFF_PASSWORD_HASH` secret (PBKDF2-SHA256), and sets a signed `HttpOnly`,
  `SameSite=Lax` cookie that lasts 30 days and does not renew. The cookie is host-only on
  the API hostname, which is same-site with the portal. `Secure` is set on HTTPS.
- Successful login and `GET /session` return `{ username, propertyTimeZone }`.
  `POST /logout` clears the cookie.
- Logins are limited to 5 per minute per IP by the `LOGIN_LIMITER` rate limit binding.
- `ALLOWED_ORIGINS` is a comma-separated list of exact origins allowed to send
  credentialed requests. Production sets it in `wrangler.jsonc`. Local dev overrides it
  in `.dev.vars`.
- If `AUTH_USERNAME`, `STAFF_PASSWORD_HASH` or `SESSION_SECRET` is missing, the Worker
  fails closed: guarded routes and login return 401 and the Worker logs the cause.
- Sessions are stateless, so one cannot be revoked alone. Rotating `SESSION_SECRET`
  signs everyone out.

Backend tests sign in through the real login route (`apps/backend/src/test-support/auth.ts`) and send
the resulting cookie. They do not bypass the guard.

## Changing the password or removing someone's access

For an explicitly authorized production credential change, run from the repo root:

```sh
pnpm auth:hash                  # prompts twice, prints the new hash
pnpm auth:hash --session-secret # prints a new session secret
pnpm --filter @pms/backend exec wrangler secret put STAFF_PASSWORD_HASH
pnpm --filter @pms/backend exec wrangler secret put SESSION_SECRET
```

When someone leaves, change both secrets. The new password is at least 12 characters.
Tell the remaining staff the new password. Everyone signs in again.

## Portal sessions

`AuthGate` in `apps/portal/src/components/auth-gate.tsx` wraps the router. It asks the API for
the session and shows the login form when there is none. Every request sends
`credentials: "include"`. A 401 from any API call clears cached data and shows the
login form again, keeping the current URL, so signing in returns to the same page.
Backend login errors are translated in `apps/portal/src/lib/errors.ts`.

See [local credential setup](../README.md#signing-in) before development,
[the property calendar](property-calendar.md) before changing session metadata,
and [release prerequisites](releases.md#setup-and-deployment-ownership) before production setup.
