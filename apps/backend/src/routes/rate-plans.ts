import { Hono } from "hono";
import type { Env } from "../env";
import { ratePlans } from "../lib/rate-plans";

export const ratePlanRoutes = new Hono<Env>();

ratePlanRoutes.get("/", (c) => c.json(Object.values(ratePlans)));
