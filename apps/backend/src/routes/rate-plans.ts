import { Hono } from "hono";
import type { Env } from "../env";
import { ratePlans } from "../lib/rate-plans";

export const ratePlanRoutes = new Hono<Env>();

// The plans staff may offer on a new reservation, Flexible (the default) first.
ratePlanRoutes.get("/", (c) => c.json(Object.values(ratePlans)));
