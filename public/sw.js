const CACHE = "dryko-pwa-v8";
const ASSETS = [
  "/manifest.webmanifest?v=5",
  "/ap-pwa-192-v5.png",
  "/ap-pwa-512-v5.png",
  "/ap-pwa-maskable-512-v5.png",
  "/ap-touch-180-v5.png",
  "/favicon.ico?v=6",
  "/favicon-32-v6.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

// Nova versão espera o usuário tocar em "Atualizar" (sem recarga silenciosa).
self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "SKIP_WAITING") self.skipWaiting();
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

  // O navegador já mantém os bundles com hash em cache. Não guardar JavaScript
  // no service worker evita carregar uma versão antiga após uma atualização.
  const cacheavel = ["style", "font", "image"].includes(request.destination);
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
