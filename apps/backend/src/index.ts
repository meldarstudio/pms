import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { HttpError } from "./http";
import { accountRoutes } from "./routes/accounts";
import { authRoutes } from "./routes/auth";
import { calendarRoutes } from "./routes/calendar";
import { controlRoutes } from "./routes/controls";
import { couponRoutes } from "./routes/coupons";
import { availabilityRoutes } from "./routes/availability";
import { inventoryRoutes } from "./routes/inventory";
import { guestRoutes } from "./routes/guests";
import { housekeepingRoutes } from "./routes/housekeeping";
import { paymentRoutes } from "./routes/payments";
import { GUEST_PREFIX, isGuestPath, publicRoutes } from "./routes/public";
import { ratePlanRoutes } from "./routes/rate-plans";
import { reservationRoutes } from "./routes/reservations";
import { roomTypeRoutes } from "./routes/room-types";
import { roomClosureRoutes } from "./routes/room-closures";
import { roomRoutes } from "./routes/rooms";
import { setupRoutes } from "./routes/setup";
import { getDb } from "./db";
import { purgeAbandonedCheckouts } from "./abandoned-checkouts";
import { sendConfirmationEmails } from "./confirmation-emails";
import {
  expireAuthentications,
  paymentContext,
  reconcilePaymentAttempts,
} from "./payment-attempts";
import { requireSession } from "./session";
import { propertyCalendar } from "./property-calendar";

const CHROME_MAX_PREFLIGHT_CACHE_SECONDS = 2 * 60 * 60;

export const app = new Hono<Env>();

const exactOrigin = (setting: string | undefined, origin: string) =>
  (setting ?? "")
    .split(",")
    .map((allowed) => allowed.trim())
    .includes(origin)
    ? origin
    : null;

const staffCors = cors({
  origin: (origin, c: Context<Env>) => exactOrigin(c.env.ALLOWED_ORIGINS, origin),
  credentials: true,
  exposeHeaders: ["X-Error-Field"],
  maxAge: CHROME_MAX_PREFLIGHT_CACHE_SECONDS,
});

const guestCors = cors({
  origin: (origin, c: Context<Env>) => exactOrigin(c.env.PUBLIC_ALLOWED_ORIGINS, origin),
  credentials: false,
  allowMethods: ["GET", "POST"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["X-Error-Field", "Retry-After"],
  maxAge: CHROME_MAX_PREFLIGHT_CACHE_SECONDS,
});

app.use("*", (c, next) => (isGuestPath(c.req.path) ? guestCors(c, next) : staffCors(c, next)));

app.use("*", requireSession);
app.use("*", async (c, next) => {
  if (c.req.path !== "/" && c.req.path !== "/logout")
    c.set("propertyCalendar", propertyCalendar(c.env.PROPERTY_TIME_ZONE));
  await next();
});

app.onError((err, c) => {
  if (err instanceof HttpError) {
    if (err.field) c.header("X-Error-Field", err.field);
    return c.json({ error: err.message }, err.status);
  }
  console.error("request failed");
  return c.json({ error: "internal error" }, 500);
});

app.notFound((c) => c.json({ error: "not found" }, 404));

app.get("/", (c) => c.json({ name: "pms" }));
app.route("/", authRoutes);
app.route("/", accountRoutes);
app.route("/room-types", roomTypeRoutes);
app.route("/rooms", roomRoutes);
app.route("/calendar", calendarRoutes);
app.route("/housekeeping", housekeepingRoutes);
app.route("/setup", setupRoutes);
app.route("/room-closures", roomClosureRoutes);
app.route("/availability", availabilityRoutes);
app.route("/inventory", inventoryRoutes);
app.route("/guests", guestRoutes);
app.route("/reservations", reservationRoutes);
app.route("/payments", paymentRoutes);
app.route("/rate-plans", ratePlanRoutes);
app.route("/coupons", couponRoutes);
app.route("/controls", controlRoutes);
app.route(GUEST_PREFIX, publicRoutes);

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    const db = getDb(env.DB);
    const step = (name: string, run: () => Promise<unknown>) =>
      run().catch(() => console.error(`scheduled ${name} failed`));
    ctx.waitUntil(
      (async () => {
        await step("payment reconciliation", () =>
          reconcilePaymentAttempts(db, paymentContext(env)),
        );
        await step("authentication expiry", () => expireAuthentications(db, new Date()));
        await step("confirmation send", () => sendConfirmationEmails(db, env));
        await step("abandoned checkout purge", () => purgeAbandonedCheckouts(db, new Date()));
      })(),
    );
  },
} satisfies ExportedHandler<Env["Bindings"]>;
