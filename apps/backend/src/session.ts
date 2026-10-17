import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Env } from "./env";
import { HttpError } from "./http";

const COOKIE = "pms_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PUBLIC_ROUTES = new Set(["GET /", "POST /login"]);

export function authConfigured(c: Context<Env>): boolean {
  const { AUTH_USERNAME, STAFF_PASSWORD_HASH, SESSION_SECRET } = c.env;
  if (AUTH_USERNAME && STAFF_PASSWORD_HASH && SESSION_SECRET) return true;
  console.error(
    "Staff login is not configured: set AUTH_USERNAME, STAFF_PASSWORD_HASH and SESSION_SECRET",
  );
  return false;
}

function isHttps(c: Context<Env>): boolean {
  return new URL(c.req.url).protocol === "https:";
}

async function hasSession(c: Context<Env>): Promise<boolean> {
  if (!authConfigured(c)) return false;
  const value = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  if (!value) return false;
  const age = Date.now() - Number(value);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_SECONDS * 1000;
}

export async function startSession(c: Context<Env>) {
  await setSignedCookie(c, COOKIE, String(Date.now()), c.env.SESSION_SECRET, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function endSession(c: Context<Env>) {
  deleteCookie(c, COOKIE, { path: "/", secure: isHttps(c) });
}

export const requireSession = createMiddleware<Env>(async (c, next) => {
  if (PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`) || (await hasSession(c))) {
    return next();
  }
  throw new HttpError(401, "unauthorized");
});
