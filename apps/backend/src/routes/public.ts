import {
  checkoutAcceptanceSchema,
  checkoutAuthenticationSchema,
  checkoutPaymentSchema,
  publicCheckoutCreateSchema,
  publicOfferSearchSchema,
} from "@pms/shared";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import type { Env } from "../env";
import { currency, HttpError, validate } from "../http";
import {
  acceptCheckoutQuote,
  checkoutForToken,
  readCheckout,
  requoteCheckout,
  startCheckout,
} from "../public-checkouts";
import { requirePublicPaymentAdmission } from "../operation-controls";
import { paymentContext } from "../payment-attempts";
import { publishedRoomTypeIds, searchOffers } from "../public-offers";
import {
  checkoutReservationAccess,
  reservationForAccessToken,
  reservationSummary,
} from "../reservation-access";
import {
  authenticateCheckout,
  chargeCheckout,
  checkoutPayment,
  payableQuote,
  TOO_MANY_PAYMENTS,
} from "../public-payments";
import { limitBySourceIp, requireWithinLimit, trustedSourceIp } from "../rate-limit";
import { requireTurnstile } from "../turnstile";

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
  c.set(
    "checkout",
    await checkoutForToken(getDb(c.env.DB), c.req.header("authorization"), guestContext(c)),
  );
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

publicRoutes.get("/checkout/access", requireCheckout, async (c) => {
  try {
    return c.json(await checkoutReservationAccess(getDb(c.env.DB), c.var.checkout.id));
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return c.json({ error: error.message }, error.status);
  }
});

publicRoutes.get("/reservation", async (c) => {
  const db = getDb(c.env.DB);
  const today = guestContext(c).today;
  try {
    const access = await reservationForAccessToken(db, c.req.header("authorization"), today);
    return c.json({
      ...(await reservationSummary(db, access.reservationId, today)),
      currency: currency(c),
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return c.json({ error: error.message }, error.status);
  }
});

publicRoutes.get("/checkout/payment", requireCheckout, async (c) =>
  c.json({
    payment: await checkoutPayment(getDb(c.env.DB), c.var.checkout, paymentContext(c.env)),
  }),
);

publicRoutes.post(
  "/checkout/payment/authentication",
  requireCheckout,
  validate("json", checkoutAuthenticationSchema),
  async (c) =>
    c.json({
      payment: await authenticateCheckout(
        getDb(c.env.DB),
        c.var.checkout,
        c.req.valid("json"),
        paymentContext(c.env, c.executionCtx.waitUntil.bind(c.executionCtx)),
      ),
    }),
);

publicRoutes.post(
  "/checkout/payments",
  requireCheckout,
  validate("json", checkoutPaymentSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const { checkout } = c.var;
    const input = c.req.valid("json");
    const context = paymentContext(c.env, c.executionCtx.waitUntil.bind(c.executionCtx));
    const open = await checkoutPayment(db, checkout, context, { open: true });
    if (open) return c.json({ payment: open });
    await requirePublicPaymentAdmission(db);
    const payable = await payableQuote(db, checkout, input.quoteId, guestContext(c));
    await requireWithinLimit(c, "PAYMENT_IP_LIMITER", trustedSourceIp(c), TOO_MANY_PAYMENTS);
    await requireWithinLimit(c, "PAYMENT_CHECKOUT_LIMITER", checkout.id, TOO_MANY_PAYMENTS);
    await requireTurnstile(c.env, input.turnstileToken, trustedSourceIp(c));
    const { created, payment } = await chargeCheckout(db, checkout, payable, input, {
      ...context,
      ...guestContext(c),
    });
    return c.json({ payment }, created ? 201 : 200);
  },
);
