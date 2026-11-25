import type { ReservationAlertSubscriptionRequest } from "@pms/shared";

const DEVICE_KEY = "pms.reservation-alert-device";

export function reservationAlertDeviceId() {
  try {
    return window.localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

export function rememberReservationAlertDevice() {
  const existing = reservationAlertDeviceId();
  if (existing) return existing;
  try {
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    throw new Error("No se pudo guardar la configuración en este dispositivo.");
  }
}

export async function loadReservationAlertBrowser() {
  if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window))
    return { status: "unsupported" } as const;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) return { status: "unavailable" } as const;
  return {
    status: "ready",
    registration,
    subscription: await registration.pushManager.getSubscription(),
    permission: Notification.permission,
  } as const;
}

type ReadyBrowser = Extract<
  Awaited<ReturnType<typeof loadReservationAlertBrowser>>,
  { status: "ready" }
>;

function decodePublicKey(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (byte) =>
    byte.charCodeAt(0),
  );
}

export function subscriptionUsesKey(subscription: PushSubscription, publicKey: string) {
  const key = subscription.options.applicationServerKey;
  if (!key) return false;
  const current = new Uint8Array(key);
  const expected = decodePublicKey(publicKey);
  return current.length === expected.length && current.every((byte, i) => byte === expected[i]);
}

export async function subscribeToReservationAlerts(
  { registration, subscription }: ReadyBrowser,
  publicKey: string,
): Promise<ReservationAlertSubscriptionRequest> {
  const deviceId = rememberReservationAlertDevice();
  if (subscription && !subscriptionUsesKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodePublicKey(publicKey),
  });
  const { p256dh, auth } = subscription.toJSON().keys ?? {};
  if (!p256dh || !auth) throw new Error("El navegador no pudo crear la suscripción.");
  return { deviceId, endpoint: subscription.endpoint, keys: { p256dh, auth } };
}

export async function clearBrowserReservationAlerts() {
  if (!("serviceWorker" in navigator && "PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  await subscription?.unsubscribe();
  for (const notification of await registration.getNotifications()) notification.close();
}
