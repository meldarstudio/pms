import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import type { Context } from "hono";
import { getDb } from "./db";
import { account, session, user, verification } from "./db/schema";
import type { Env } from "./env";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type AccountRole } from "./account-sql";

const SESSION_SECONDS = 30 * 24 * 60 * 60;

// Better Auth runs only through the app's own routes; its HTTP handler is never
// mounted, so sign-up and other built-in endpoints are unreachable.
export function createAuth(c: Context<Env>) {
  return betterAuth({
    secret: c.env.SESSION_SECRET,
    baseURL: new URL(c.req.url).origin,
    trustedOrigins: allowedOrigins(c),
    database: drizzleAdapter(getDb(c.env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "staff", input: false },
      },
    },
    session: { expiresIn: SESSION_SECONDS, updateAge: 24 * 60 * 60 },
    rateLimit: { enabled: false },
    advanced: { cookiePrefix: "pms" },
    telemetry: { enabled: false },
    plugins: [username()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export type SignedInAccount = { id: string; username: string; role: AccountRole };

export function allowedOrigins(c: Context<Env>): string[] {
  return (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
