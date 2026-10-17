import { loginSchema } from "@pms/shared";
import { Hono } from "hono";
import type { Env } from "../env";
import { HttpError, validate } from "../http";
import { matchesText, verifyPassword } from "../password";
import { authConfigured, endSession, startSession } from "../session";

export const authRoutes = new Hono<Env>();

authRoutes.post("/login", validate("json", loginSchema), async (c) => {
  const { success } = await c.env.LOGIN_LIMITER.limit({
    key: c.req.header("cf-connecting-ip") ?? "unknown",
  });
  if (!success) throw new HttpError(429, "too many login attempts");
  if (!authConfigured(c)) throw new HttpError(401, "invalid credentials");

  const { username, password } = c.req.valid("json");
  const [usernameMatches, passwordMatches] = await Promise.all([
    matchesText(username.toLowerCase(), c.env.AUTH_USERNAME.toLowerCase()),
    verifyPassword(password, c.env.STAFF_PASSWORD_HASH),
  ]);
  if (!usernameMatches || !passwordMatches) throw new HttpError(401, "invalid credentials");

  await startSession(c);
  return c.json({ username: c.env.AUTH_USERNAME });
});

authRoutes.post("/logout", (c) => {
  endSession(c);
  return c.json({ ok: true });
});

authRoutes.get("/session", (c) => c.json({ username: c.env.AUTH_USERNAME }));
