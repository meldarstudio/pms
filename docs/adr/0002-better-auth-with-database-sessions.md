# Better Auth with database sessions

Sign-in moves from one shared password in a Worker secret with a stateless signed cookie to Better Auth, with accounts and sessions stored in D1. For now there are only two accounts: the shared Staff account and the Owner account. We chose Better Auth anyway because per-person logins are planned, and adding them should mean creating accounts, not rebuilding sign-in. Stored sessions also let the owner change the staff password and sign out every staff session without signing themselves out, which the stateless cookie could not do.

## Considered options

- Add a second password hash secret for the owner and a role claim in the signed cookie. Rejected: it cannot sign out one account's sessions alone, and per-person logins would need another rebuild.
- Use Better Auth's admin plugin for roles. Rejected: it brings user management, banning and impersonation endpoints we do not need, and its admin role would have to be mapped to the owner. A `role` field on the account with values `staff` and `owner` is enough, and the app checks it itself.

## Consequences

- Both roles can do the same things, except that only the owner can manage accounts. Owner-only features such as financial reports are added by checking the role.
- Changes are still not attributed to a person, because the Staff account is shared.
- Cutover requires a production migration, and everyone signs in once more.
- Accounts are created by a command-line script. Public sign-up is disabled.
