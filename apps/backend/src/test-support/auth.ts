import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "better-auth/crypto";
import { app } from "../index";
import type { Env } from "../env";
import { accountSql, type AccountRole } from "../account-sql";

export const PORTAL_ORIGIN = "https://app.hotelmanantialchurin.com";
export const WEBSITE_ORIGIN = "https://www.hotelmanantialchurin.com";

export const ACCOUNTS = {
  staff: { username: "hotelmanantial", password: "correct horse battery staple" },
  owner: { username: "duena", password: "owner horse battery staple" },
} satisfies Record<AccountRole, { username: string; password: string }>;

export const STAFF_USERNAME = ACCOUNTS.staff.username;

const hashes = new Map<string, Promise<string>>();

export async function seedAccounts(sqlite: DatabaseSync) {
  for (const [role, { username, password }] of Object.entries(ACCOUNTS)) {
    if (!hashes.has(password)) hashes.set(password, hashPassword(password));
    sqlite.exec(
      accountSql({
        username,
        role: role as AccountRole,
        passwordHash: await hashes.get(password)!,
        id: `${role}-account`,
        now: Date.now(),
      }),
    );
  }
}

export function authEnv(DB: D1Database, overrides: Partial<Env["Bindings"]> = {}): Env["Bindings"] {
  return {
    DB,
    CURRENCY: "PEN",
    PROPERTY_TIME_ZONE: "America/Lima",
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    ALLOWED_ORIGINS: PORTAL_ORIGIN,
    PUBLIC_ALLOWED_ORIGINS: WEBSITE_ORIGIN,
    PUBLISHED_ROOM_TYPE_IDS: "",
    LOGIN_LIMITER: { limit: async () => ({ success: true }) },
    SEARCH_LIMITER: { limit: async () => ({ success: true }) },
    REFERENCE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    QUOTE_LIMITER: { limit: async () => ({ success: true }) },
    PAYMENT_IP_LIMITER: { limit: async () => ({ success: true }) },
    PAYMENT_CHECKOUT_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

export function login(env: Env["Bindings"], body: unknown = loginBody()) {
  return app.request(
    "/login",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: PORTAL_ORIGIN },
      body: JSON.stringify(body),
    },
    env,
  );
}

export function loginBody(overrides: Record<string, string> = {}, role: AccountRole = "staff") {
  return { ...ACCOUNTS[role], ...overrides };
}

export async function signIn(env: Env["Bindings"], role: AccountRole = "staff"): Promise<string> {
  const response = await login(env, loginBody({}, role));
  if (response.status !== 200) throw new Error(`sign-in failed with ${response.status}`);
  return sessionCookie(response);
}

export function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0]!)
    .join("; ");
}
