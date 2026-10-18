const BUILD_ID = new URL(self.location.href).searchParams.get("build") ?? "development";
const CACHE_NAME = `manantial-shell-${BUILD_ID}`;
const OFFLINE_URL = "/offline.html";
let updateClientId;
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
      if (updateClientId) {
        const client = await self.clients.get(updateClientId);
        client?.postMessage("UPDATE_ACTIVATED");
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "ACTIVATE_UPDATE") {
    updateClientId = event.source?.id;
    self.skipWaiting();
  }
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
