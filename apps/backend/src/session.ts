import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createAuth, type SignedInAccount } from "./auth";
import type { Env } from "./env";
import { HttpError } from "./http";

const PUBLIC_ROUTES = new Set(["GET /", "POST /login"]);

export const isGuestPath = (path: string) => path === "/public" || path.startsWith("/public/");

export function authConfigured(c: Context<Env>): boolean {
  if (c.env.SESSION_SECRET) return true;
  console.error("Sign-in is not configured: set SESSION_SECRET");
  return false;
}

export function forwardCookies(c: Context<Env>, headers: Headers | null | undefined) {
  for (const cookie of headers?.getSetCookie() ?? [])
    c.header("set-cookie", cookie, { append: true });
}

export function toAccount(user: { id: string; username?: string | null; role?: unknown }) {
  return {
    id: user.id,
    username: user.username ?? "",
    role: user.role === "owner" ? "owner" : "staff",
  } satisfies SignedInAccount;
}

export const requireSession = createMiddleware<Env>(async (c, next) => {
  if (isGuestPath(c.req.path)) return next();
  const isPublic = PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`);
  const configured = authConfigured(c);
  if (!isPublic && !configured) throw new HttpError(401, "unauthorized");
  if (configured) c.set("auth", createAuth(c));
  if (isPublic) return next();

  const { headers, response } = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  if (!response) throw new HttpError(401, "unauthorized");
  forwardCookies(c, headers);
  c.set("account", toAccount(response.user));
  return next();
});

export const requireOwner = createMiddleware<Env>(async (c, next) => {
  if (c.var.account.role !== "owner") throw new HttpError(403, "owner account required");
  return next();
});
