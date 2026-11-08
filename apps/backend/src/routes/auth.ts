import { loginSchema } from "@pms/shared";
import { APIError } from "better-auth/api";
import { Hono, type Context } from "hono";
import type { SignedInAccount } from "../auth";
import type { Env } from "../env";
import { HttpError, validate } from "../http";
import { limitBySourceIp } from "../rate-limit";
import { authConfigured, forwardCookies, toAccount } from "../session";

export const authRoutes = new Hono<Env>();

authRoutes.post(
  "/login",
  validate("json", loginSchema),
  limitBySourceIp("LOGIN_LIMITER", "too many login attempts"),
  async (c) => {
    if (!authConfigured(c)) throw new HttpError(401, "invalid credentials");

    const { username, password } = c.req.valid("json");
    try {
      const { headers, response } = await c.var.auth.api.signInUsername({
        body: { username, password },
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      if (!response) throw new HttpError(401, "invalid credentials");
      forwardCookies(c, headers);
      return c.json(sessionBody(c, toAccount(response.user)));
    } catch (error) {
      if (error instanceof APIError) throw new HttpError(401, "invalid credentials");
      throw error;
    }
  },
);

authRoutes.post("/logout", async (c) => {
  const { headers } = await c.var.auth.api.signOut({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  forwardCookies(c, headers);
  return c.json({ ok: true });
});

authRoutes.get("/session", (c) => {
  return c.json(sessionBody(c, c.var.account));
});

function sessionBody(c: Context<Env>, { username, role }: SignedInAccount) {
  return { username, role, propertyTimeZone: c.get("propertyCalendar").timeZone };
}
