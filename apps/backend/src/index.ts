import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { HttpError } from "./http";
import { accountRoutes } from "./routes/accounts";
import { authRoutes } from "./routes/auth";
import { calendarRoutes } from "./routes/calendar";
import { availabilityRoutes } from "./routes/availability";
import { inventoryRoutes } from "./routes/inventory";
import { guestRoutes } from "./routes/guests";
import { housekeepingRoutes } from "./routes/housekeeping";
import { paymentRoutes } from "./routes/payments";
import { ratePlanRoutes } from "./routes/rate-plans";
import { reservationRoutes } from "./routes/reservations";
import { roomTypeRoutes } from "./routes/room-types";
import { roomClosureRoutes } from "./routes/room-closures";
import { roomRoutes } from "./routes/rooms";
import { setupRoutes } from "./routes/setup";
import { requireSession } from "./session";
import { propertyCalendar } from "./property-calendar";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: (origin, c: Context<Env>) =>
      (c.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((allowed) => allowed.trim())
        .includes(origin)
        ? origin
        : null,
    credentials: true,
    exposeHeaders: ["X-Error-Field"],
  }),
);

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
  console.error(err);
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

export default app;
