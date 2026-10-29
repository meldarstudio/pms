import { accountPasswordSchema, ownPasswordSchema } from "@pms/shared";
import { APIError } from "better-auth/api";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { user } from "../db/schema";
import type { Env } from "../env";
import { HttpError, validate } from "../http";
import { forwardCookies, requireOwner, toAccount } from "../session";

export const accountRoutes = new Hono<Env>();

accountRoutes.get("/accounts", requireOwner, async (c) => {
  const rows = await getDb(c.env.DB)
    .select({ id: user.id, username: user.username, role: user.role })
    .from(user)
    .orderBy(asc(user.role), asc(user.username));
  return c.json(rows.map(toAccount));
});

accountRoutes.put(
  "/accounts/:id/password",
  requireOwner,
  validate("json", accountPasswordSchema),
  async (c) => {
    const id = c.req.param("id");
    if (id === c.var.account.id)
      throw new HttpError(400, "change your own password with your current password");
    const context = await c.var.auth.$context;
    if (!(await context.internalAdapter.findUserById(id)))
      throw new HttpError(404, "account not found");
    const hash = await context.password.hash(c.req.valid("json").password);
    await context.internalAdapter.updatePassword(id, hash);
    await context.internalAdapter.deleteUserSessions(id);
    return c.json({ ok: true });
  },
);

accountRoutes.put(
  "/account/password",
  requireOwner,
  validate("json", ownPasswordSchema),
  async (c) => {
    const { currentPassword, newPassword } = c.req.valid("json");
    try {
      const { headers } = await c.var.auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      forwardCookies(c, headers);
    } catch (error) {
      if (error instanceof APIError && error.body?.code === "INVALID_PASSWORD")
        throw new HttpError(400, "current password is incorrect", "currentPassword");
      throw error;
    }
    return c.json({ ok: true });
  },
);
