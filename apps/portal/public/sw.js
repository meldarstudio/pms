const BUILD_ID = new URL(self.location.href).searchParams.get("build") ?? "development";
const CACHE_NAME = `manantial-shell-${BUILD_ID}`;
const OFFLINE_URL = "/offline.html";
const DECLARATIVE_WEB_PUSH = 8030;
const RESERVATION_ALERT_PATH = /^\/reservations\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHELL_URLS = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_URLS);
      const shell = await cache.match("/");
      const html = await shell?.text();
      if (!html) return;

      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(
        (match) => match[1],
      );
      for (const asset of assets.filter((url) => url.endsWith(".css"))) {
        const response = await fetch(asset);
        if (!response.ok) continue;
        await cache.put(asset, response.clone());
        const css = await response.text();
        assets.push(
          ...[...css.matchAll(/url\(["']?(\/assets\/[^"')]+)["']?\)/g)].map((match) => match[1]),
        );
      }
      await cache.addAll([...new Set(assets)]);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("manantial-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)),
      ),
    );
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});

function reservationAlertUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === self.location.origin &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      RESERVATION_ALERT_PATH.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  if (event.notification) return;
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  const alert = payload?.notification;
  const url = reservationAlertUrl(alert?.navigate);
  if (
    payload?.web_push !== DECLARATIVE_WEB_PUSH ||
    !url ||
    typeof alert.title !== "string" ||
    typeof alert.body !== "string" ||
    typeof alert.tag !== "string"
  )
    return;

  event.waitUntil(
    self.registration.showNotification(alert.title, {
      body: alert.body,
      icon: "/icons/icon-192.png",
      lang: "es-PE",
      tag: alert.tag,
      data: { navigate: url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = reservationAlertUrl(event.notification.data?.navigate);
  if (!url) return;
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => client.url === url);
      if (existing) {
        await existing.focus();
        return;
      }
      const opened = await self.clients.openWindow(url).catch(() => null);
      if (opened?.url === url) return;
      const navigated = await (opened ?? windows[0])?.navigate(url);
      await navigated?.focus();
    })(),
  );
});
