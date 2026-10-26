// SQL that creates an account or replaces its password and role, for the
// account script and test setup. Accounts have no public sign-up route.

export type AccountRole = "staff" | "owner";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

const quote = (value: string | number) =>
  typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;

export function accountSql(input: {
  username: string;
  role: AccountRole;
  /** A Better Auth password hash. */
  passwordHash: string;
  id: string;
  now: number;
}): string {
  const username = input.username.toLowerCase();
  if (!USERNAME_PATTERN.test(username))
    throw new Error("Usernames use 3 to 30 letters, digits, underscores, or dots.");
  const name = quote(username);
  const id = quote(input.id);
  const role = quote(input.role);
  const hash = quote(input.passwordHash);
  const now = quote(input.now);
  const userId = `(SELECT id FROM "user" WHERE username = ${name})`;
  return [
    `INSERT INTO "user" (id, name, email, email_verified, username, display_username, role, created_at, updated_at)
VALUES (${id}, ${name}, ${quote(`${username}@accounts.invalid`)}, 0, ${name}, ${name}, ${role}, ${now}, ${now})
ON CONFLICT (username) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at;`,
    `DELETE FROM account WHERE provider_id = 'credential' AND user_id = ${userId};`,
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT ${id}, id, 'credential', id, ${hash}, ${now}, ${now} FROM "user" WHERE username = ${name};`,
    `DELETE FROM session WHERE user_id = ${userId};`,
  ].join("\n");
}
