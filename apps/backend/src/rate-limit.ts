import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env } from "./env";
import { HttpError } from "./http";

type LimiterBinding = {
  [K in keyof Env["Bindings"]]-?: Env["Bindings"][K] extends RateLimit ? K : never;
}[keyof Env["Bindings"]];

const LIMIT_PERIOD_SECONDS = 60;

export function trustedSourceIp(c: Context<Env>) {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

export function limitBySourceIp(binding: LimiterBinding, message: string) {
  return createMiddleware<Env>(async (c, next) => {
    const { success } = await c.env[binding].limit({ key: trustedSourceIp(c) });
    if (!success) {
      c.header("Retry-After", String(LIMIT_PERIOD_SECONDS));
      throw new HttpError(429, message);
    }
    return next();
  });
}
