import app from "../index";
import type { Env } from "../env";
import { hashPassword } from "../password";

export const STAFF_USERNAME = "hotelmanantial";
export const STAFF_PASSWORD = "correct horse battery staple";
export const PORTAL_ORIGIN = "https://app.hotelmanantialchurin.com";

let passwordHash: Promise<string> | undefined;

export async function authEnv(overrides: Partial<Env["Bindings"]> = {}): Promise<Env["Bindings"]> {
  passwordHash ??= hashPassword(STAFF_PASSWORD);
  return {
    DB: {} as D1Database,
    CURRENCY: "PEN",
    AUTH_USERNAME: STAFF_USERNAME,
    STAFF_PASSWORD_HASH: await passwordHash,
    SESSION_SECRET: "test-session-secret",
    ALLOWED_ORIGINS: PORTAL_ORIGIN,
    LOGIN_LIMITER: { limit: async () => ({ success: true }) },
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

export function loginBody(overrides: Record<string, string> = {}) {
  return { username: STAFF_USERNAME, password: STAFF_PASSWORD, ...overrides };
}

export async function signIn(env: Env["Bindings"]): Promise<string> {
  const response = await login(env);
  if (response.status !== 200) throw new Error(`sign-in failed with ${response.status}`);
  return response.headers.getSetCookie()[0]!.split(";")[0]!;
}
