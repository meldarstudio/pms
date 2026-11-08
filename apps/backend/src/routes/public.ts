import {
  checkoutAcceptanceSchema,
  publicCheckoutCreateSchema,
  publicOfferSearchSchema,
} from "@pms/shared";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import type { Env } from "../env";
import { currency, validate } from "../http";
import {
  acceptCheckoutQuote,
  checkoutForToken,
  readCheckout,
  requoteCheckout,
  startCheckout,
} from "../public-checkouts";
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

const guestContext = (c: Context<Env>) => ({
  today: c.get("propertyCalendar").today,
  now: new Date(),
  published: publishedRoomTypeIds(c.env.PUBLISHED_ROOM_TYPE_IDS),
});

const limitNewQuotes = limitBySourceIp("QUOTE_LIMITER", "too many quotes");

const requireCheckout = createMiddleware<Env>(async (c, next) => {
  c.set("checkout", await checkoutForToken(getDb(c.env.DB), c.req.header("authorization")));
  return next();
});

publicRoutes.get(
  "/offers",
  limitBySourceIp("SEARCH_LIMITER", "too many searches"),
  validate("query", publicOfferSearchSchema),
  async (c) => {
    const result = await searchOffers(getDb(c.env.DB), c.req.valid("query"), guestContext(c));
    return c.json({ ...result, currency: currency(c) });
  },
);

publicRoutes.post(
  "/checkouts",
  limitNewQuotes,
  validate("json", publicCheckoutCreateSchema),
  async (c) => {
    const { token, view } = await startCheckout(
      getDb(c.env.DB),
      c.req.valid("json"),
      guestContext(c),
    );
    return c.json({ token, ...view, currency: currency(c) }, 201);
  },
);

publicRoutes.get("/checkout", requireCheckout, async (c) => {
  const view = await readCheckout(getDb(c.env.DB), c.var.checkout, guestContext(c));
  return c.json({ ...view, currency: currency(c) });
});

publicRoutes.post("/checkout/quotes", limitNewQuotes, requireCheckout, async (c) => {
  const view = await requoteCheckout(getDb(c.env.DB), c.var.checkout, guestContext(c));
  return c.json({ ...view, currency: currency(c) }, 201);
});

publicRoutes.post(
  "/checkout/acceptances",
  requireCheckout,
  validate("json", checkoutAcceptanceSchema),
  async (c) => {
    const view = await acceptCheckoutQuote(
      getDb(c.env.DB),
      c.var.checkout,
      c.req.valid("json"),
      guestContext(c),
    );
    return c.json({ ...view, currency: currency(c) }, 201);
  },
);
