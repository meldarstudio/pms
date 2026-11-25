import { buildPushPayload } from "@block65/webcrypto-web-push";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  reservationAlertDeliveries as deliveries,
  reservationAlertDevices as devices,
} from "./db/schema";
import type { Env } from "./env";
import { trustedPushEndpoint, webPushKeys } from "./reservation-alert-devices";

const ALERT_LIFETIME_MS = 60 * 60_000;
const RETRY_DELAY_MS = 2 * 60_000;
const PUSH_TIMEOUT_MS = 8_000;
const PUSH_BATCH_SIZE = 10;
const WEB_PUSH_SUBJECT = "https://www.hotelmanantialchurin.com";
const DECLARATIVE_WEB_PUSH = 8030;
const arrivalDate = new Intl.DateTimeFormat("es-PE", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function queueNewWebReservationAlert(
  db: Db,
  reservationId: string,
  checkIn: string,
  now: string,
) {
  const expiresAt = new Date(Date.parse(now) + ALERT_LIFETIME_MS).toISOString();
  return db.insert(deliveries).select(
    db
      .select({
        reservationId: sql<string>`${reservationId}`.as("reservation_id"),
        deviceId: devices.id,
        checkIn: sql<string>`${checkIn}`.as("check_in"),
        nextAttemptAt: sql<string>`${now}`.as("next_attempt_at"),
        expiresAt: sql<string>`${expiresAt}`.as("expires_at"),
      })
      .from(devices),
  );
}

export async function sendNewWebReservationAlerts(db: Db, env: Env["Bindings"]) {
  const clock = Date.now();
  const now = new Date(clock).toISOString();
  await db.delete(deliveries).where(lte(deliveries.expiresAt, now));
  const keys = webPushKeys(env);
  if (!keys) return;

  const due = await db
    .select()
    .from(deliveries)
    .innerJoin(devices, eq(devices.id, deliveries.deviceId))
    .where(lte(deliveries.nextAttemptAt, now))
    .orderBy(deliveries.nextAttemptAt)
    .limit(PUSH_BATCH_SIZE);

  await Promise.all(
    due.map(async ({ reservation_alert_deliveries: alert, reservation_alert_devices: device }) => {
      const delivery = and(
        eq(deliveries.reservationId, alert.reservationId),
        eq(deliveries.deviceId, alert.deviceId),
      );
      const [claimed] = await db
        .update(deliveries)
        .set({ nextAttemptAt: new Date(clock + RETRY_DELAY_MS).toISOString() })
        .where(and(delivery, lte(deliveries.nextAttemptAt, now), gt(deliveries.expiresAt, now)))
        .returning({ deviceId: deliveries.deviceId });
      if (!claimed) return;

      const status = await sendAlert(db, alert, device, keys).catch(() => {
        console.error("reservation alert delivery failed");
        return null;
      });
      if (status === 429) return;
      if (status === 404 || status === 410) {
        await db.delete(devices).where(sameDeviceSubscription(device));
      } else if (status !== null && status >= 300) {
        console.error(`reservation alert rejected (${status})`);
      }
      await db.delete(deliveries).where(delivery);
    }),
  );
}

function sameDeviceSubscription({
  id,
  portalOrigin,
  endpoint,
  p256dh,
  auth,
}: typeof devices.$inferSelect) {
  return and(
    eq(devices.id, id),
    eq(devices.portalOrigin, portalOrigin),
    eq(devices.endpoint, endpoint),
    eq(devices.p256dh, p256dh),
    eq(devices.auth, auth),
  );
}

const reservationUuidTo32CharacterTopic = (id: string) => id.replaceAll("-", "");

async function sendAlert(
  db: Db,
  { reservationId, checkIn, expiresAt }: typeof deliveries.$inferSelect,
  device: typeof devices.$inferSelect,
  keys: NonNullable<ReturnType<typeof webPushKeys>>,
) {
  const { endpoint, portalOrigin, p256dh, auth } = device;
  if (!trustedPushEndpoint(endpoint)) return 400;
  const ttl = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
  if (ttl < 1) return 204;
  const payload = await buildPushPayload(
    {
      data: {
        web_push: DECLARATIVE_WEB_PUSH,
        notification: {
          title: "Nueva reserva web",
          body: `Llegada: ${arrivalDate.format(new Date(`${checkIn}T00:00:00Z`))}`,
          navigate: new URL(`/reservations/${reservationId}`, portalOrigin).href,
          icon: new URL("/icons/icon-192.png", portalOrigin).href,
          lang: "es-PE",
          tag: `new-web-reservation:${reservationId}`,
        },
      },
      options: { ttl, topic: reservationUuidTo32CharacterTopic(reservationId), urgency: "high" },
    },
    { endpoint, expirationTime: null, keys: { p256dh, auth } },
    { ...keys, subject: WEB_PUSH_SUBJECT },
  );
  const [stillOptedIn] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(sameDeviceSubscription(device));
  if (!stillOptedIn) return 204;
  const response = await fetch(endpoint, {
    ...payload,
    redirect: "error",
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
  });
  await response.body?.cancel().catch(() => {});
  return response.status;
}
