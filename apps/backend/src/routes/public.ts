import { publicOfferSearchSchema } from "@pms/shared";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { currency, validate } from "../http";
import { publishedRoomTypeIds, searchOffers } from "../public-offers";
import { limitBySourceIp } from "../rate-limit";

export const GUEST_PREFIX = "/public";

export const isGuestPath = (path: string) =>
  path === GUEST_PREFIX || path.startsWith(`${GUEST_PREFIX}/`);

export const publicRoutes = new Hono<Env>();

publicRoutes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

publicRoutes.get(
  "/offers",
  limitBySourceIp("SEARCH_LIMITER", "too many searches"),
  validate("query", publicOfferSearchSchema),
  async (c) => {
    const result = await searchOffers(getDb(c.env.DB), c.req.valid("query"), {
      today: c.get("propertyCalendar").today,
      published: publishedRoomTypeIds(c.env.PUBLISHED_ROOM_TYPE_IDS),
    });
    return c.json({ ...result, currency: currency(c) });
  },
);
