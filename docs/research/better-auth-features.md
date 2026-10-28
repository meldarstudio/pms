# Better Auth feature exploration

Researched on 2026-10-27 against current official documentation. This is an
exploratory note, not an implementation plan or production verification. The
installed version is pinned in [the backend package](../../apps/backend/package.json);
check version compatibility before implementing examples from the live docs.

## What this project uses

The app enables the username plugin, password sign-in, and database sessions in
[auth.ts](../../apps/backend/src/auth.ts). Its custom routes handle login, logout,
session reads, and owner password management. Public sign-up is disabled, and the
Better Auth HTTP handler is not mounted. Adding a plugin alone would not expose a
usable portal feature. See [authentication](../authentication.md) for current
behavior.

Accounts currently receive placeholder addresses ending in `@accounts.invalid` in
[account-sql.ts](../../apps/backend/src/account-sql.ts). Email-based recovery or
sign-in would need real addresses as well as a delivery service.

The app implements its own owner and staff roles. [ADR 0002](../adr/0002-better-auth-with-database-sessions.md)
deliberately rejected the admin plugin because the current account model does not
need its broader management functions. Individual staff accounts are planned;
they would not automatically create a history of reservation or payment changes.

## Available capabilities

| Capability                                                                                                                     | What Better Auth supplies                                                                                                                      | Possible use in this portal                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Session management](https://better-auth.com/docs/concepts/session-management)                                                 | List active sessions and revoke one, other sessions, or all sessions. Core functionality.                                                      | A screen to review signed-in devices and sign out an old device.                                                                  |
| [Password recovery and email verification](https://better-auth.com/docs/authentication/email-password)                         | Reset links and verification flows, with application-provided email sending callbacks. Core functionality.                                     | Owner self-service password recovery after collecting a real recovery email and configuring delivery.                             |
| [Two-factor authentication](https://better-auth.com/docs/plugins/2fa)                                                          | Authenticator app codes, delivered one-time codes, backup codes, and trusted devices. Plugin.                                                  | Add a second verification step to owner sign-in.                                                                                  |
| [Passkeys](https://better-auth.com/docs/plugins/passkey)                                                                       | WebAuthn sign-in using biometrics, a device PIN, or a security key. Separate plugin package.                                                   | Owner sign-in using Face ID, Touch ID, or a security key.                                                                         |
| [Social sign-in](https://better-auth.com/docs/concepts/oauth)                                                                  | Provider sign-in and account linking. Core configuration.                                                                                      | Google sign-in for individual staff accounts, with explicit account admission rules.                                              |
| [Magic links](https://better-auth.com/docs/plugins/magic-link) and [email OTP](https://better-auth.com/docs/plugins/email-otp) | Sign-in through an emailed link or one-time code; email OTP also supports verification and password reset. Plugins require delivery callbacks. | Passwordless sign-in for people with individual email addresses.                                                                  |
| [Admin management](https://better-auth.com/docs/plugins/admin)                                                                 | Create accounts, manage roles, ban accounts, and impersonate accounts. Plugin.                                                                 | Reconsider only if account administration outgrows the existing owner controls and ADR 0002's reasoning.                          |
| [Organizations](https://better-auth.com/docs/plugins/organization)                                                             | Memberships, invitations, teams, roles, and permissions. Plugin.                                                                               | A possible account structure for a future multi-property product. Property data isolation would still require application design. |
| [API keys](https://better-auth.com/docs/plugins/api-key)                                                                       | Create, verify, expire, and rate-limit API keys. Separate plugin package.                                                                      | Authenticate future integrations or automation after adding the application's permission checks.                                  |
| [Enterprise SSO](https://better-auth.com/docs/plugins/sso)                                                                     | OIDC, OAuth2, and SAML sign-in. Separate plugin package.                                                                                       | Access through a hotel's corporate identity provider.                                                                             |
| [Captcha](https://better-auth.com/docs/plugins/captcha)                                                                        | Integrations including Cloudflare Turnstile, reCAPTCHA, and hCaptcha. Plugin.                                                                  | Extra bot protection for login if needed. The current app already rate-limits login through Cloudflare.                           |
| [Device authorization](https://better-auth.com/docs/plugins/device-authorization)                                              | Approve a limited-input device or CLI through a browser and short code. Plugin.                                                                | Future command-line tools or dedicated devices.                                                                                   |

## Scope and cost

The [framework is free and open source](https://better-auth.com/pricing). Better
Auth also offers optional managed infrastructure with dashboard access, auth audit
logs, security detections, email/SMS delivery, and self-service SSO. Those services
have separate plans and usage charges. An installed library does not provision
them, and auth audit logs do not replace an application history of reservation or
payment changes.

## Suggested exploration order

For this portal, consider individual staff accounts and a session-management screen
first. They fit the existing database-session architecture. Owner 2FA or passkeys
would add sign-in protection. Self-service recovery would reduce dependence on the
account script, but requires a real recovery address and email delivery.

Organizations, enterprise SSO, API keys, and device authorization are options for
future requirements rather than necessary additions to the current two-account
portal. These priorities are project-specific judgments, not Better Auth defaults.
