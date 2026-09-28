const CACHE = "dryko-pwa-v1";
const ASSETS = [
  "/manifest.webmanifest",
  "/pwa-icon-192.svg",
  "/pwa-icon-512.svg",
  "/dryko-logo.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const cacheavel = ["style", "script", "font", "image"].includes(request.destination);
  if (!cacheavel) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const atualizacao = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || atualizacao;
    }),
  );
});
