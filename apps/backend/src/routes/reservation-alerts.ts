import {
  reservationAlertDeviceSchema,
  reservationAlertSettingsSchema,
  reservationAlertSubscriptionSchema,
} from "@pms/shared";
import { Hono } from "hono";
import { allowedOrigins } from "../auth";
import { getDb } from "../db";
import type { Env } from "../env";
import { HttpError, validate } from "../http";
import {
  disableReservationAlerts,
  enableReservationAlerts,
  reservationAlertsEnabled,
  webPushKeys,
} from "../reservation-alert-devices";

export const reservationAlertRoutes = new Hono<Env>();

reservationAlertRoutes.get("/", validate("query", reservationAlertSettingsSchema), async (c) => {
  const { deviceId } = c.req.valid("query");
  const publicKey = webPushKeys(c.env)?.publicKey ?? null;
  const enabled = deviceId
    ? await reservationAlertsEnabled(getDb(c.env.DB), c.var.account.id, deviceId)
    : false;
  c.header("Cache-Control", "no-store");
  return c.json({ publicKey, enabled });
});

reservationAlertRoutes.put("/", validate("json", reservationAlertSubscriptionSchema), async (c) => {
  if (!webPushKeys(c.env)) throw new HttpError(503, "reservation alerts are not configured");
  const portalOrigin = c.req.header("origin");
  if (!portalOrigin || !allowedOrigins(c).includes(portalOrigin))
    throw new HttpError(403, "invalid notification origin");
  await enableReservationAlerts(
    getDb(c.env.DB),
    c.var.account.id,
    c.var.authSessionId,
    portalOrigin,
    c.req.valid("json"),
  );
  return c.json({ enabled: true });
});

reservationAlertRoutes.delete("/", validate("json", reservationAlertDeviceSchema), async (c) => {
  await disableReservationAlerts(getDb(c.env.DB), c.var.account.id, c.req.valid("json").deviceId);
  return c.json({ enabled: false });
});
