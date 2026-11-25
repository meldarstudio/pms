import type { ReservationAlertSubscriptionRequest } from "@pms/shared";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "./db";
import { reservationAlertDevices, session } from "./db/schema";
import type { Env } from "./env";
import { HttpError, rethrowConflict } from "./http";

export function webPushKeys(env: Env["Bindings"]) {
  const { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: privateKey } = env;
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

export function trustedPushEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  const { hostname } = url;
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.hash &&
    (hostname === "fcm.googleapis.com" ||
      hostname === "updates.push.services.mozilla.com" ||
      hostname.endsWith(".push.apple.com") ||
      hostname.endsWith(".notify.windows.com"))
  );
}

const ownedDevice = (accountId: string, deviceId: string) =>
  and(eq(reservationAlertDevices.accountId, accountId), eq(reservationAlertDevices.id, deviceId));

export async function reservationAlertsEnabled(db: Db, accountId: string, deviceId: string) {
  const [registered] = await db
    .select({ id: reservationAlertDevices.id })
    .from(reservationAlertDevices)
    .where(ownedDevice(accountId, deviceId));
  return registered !== undefined;
}

export async function enableReservationAlerts(
  db: Db,
  accountId: string,
  sessionId: string,
  portalOrigin: string,
  input: ReservationAlertSubscriptionRequest,
) {
  const endpoint = new URL(input.endpoint).href;
  if (!trustedPushEndpoint(endpoint)) throw new HttpError(400, "invalid push endpoint");
  try {
    const key = Uint8Array.from(
      atob(input.keys.p256dh.replaceAll("-", "+").replaceAll("_", "/")),
      (byte) => byte.charCodeAt(0),
    );
    await crypto.subtle.importKey("raw", key, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    throw new HttpError(400, "invalid push key");
  }
  const subscription = { ...input.keys, endpoint, portalOrigin };
  const activeSession = and(
    eq(session.id, sessionId),
    eq(session.userId, accountId),
    gt(session.expiresAt, new Date()),
  );
  const [device] = await db
    .insert(reservationAlertDevices)
    .select(
      db
        .select({
          id: sql<string>`${input.deviceId}`.as("id"),
          accountId: session.userId,
          portalOrigin: sql<string>`${subscription.portalOrigin}`.as("portal_origin"),
          endpoint: sql<string>`${endpoint}`.as("endpoint"),
          p256dh: sql<string>`${subscription.p256dh}`.as("p256dh"),
          auth: sql<string>`${subscription.auth}`.as("auth"),
        })
        .from(session)
        .where(activeSession),
    )
    .onConflictDoUpdate({
      target: reservationAlertDevices.id,
      set: subscription,
      setWhere: eq(reservationAlertDevices.accountId, accountId),
    })
    .returning({ id: reservationAlertDevices.id })
    .catch(rethrowConflict);
  if (device) return;
  const [signedIn] = await db.select({ id: session.id }).from(session).where(activeSession);
  if (!signedIn) throw new HttpError(401, "unauthorized");
  throw new HttpError(409, "notification device already registered");
}

export async function disableReservationAlerts(db: Db, accountId: string, deviceId: string) {
  await db.delete(reservationAlertDevices).where(ownedDevice(accountId, deviceId));
}
