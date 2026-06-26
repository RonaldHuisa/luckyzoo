const CACHE_NAME = "greenvest-pwa-v122";
const STATIC_ASSETS = [
  "/manifest.json?v=greenvest-v122",
  "/favicon.ico?v=greenvest-v122",
  "/icons/icon-192.png?v=greenvest-v122",
  "/icons/icon-512.png?v=greenvest-v122"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => null))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  // Nunca cachear API, HTML, JS/CSS build ni el archivo de versión.
  // Esto evita que Home muestre saldos antiguos después de una recarga.
  const isApiRequest = requestUrl.pathname.startsWith("/api/") || requestUrl.href.includes("/api/");

  if (
    isApiRequest ||
    event.request.mode === "navigate" ||
    requestUrl.pathname.endsWith(".html") ||
    requestUrl.pathname.includes("/static/") ||
    requestUrl.pathname.endsWith("/app-version.json")
  ) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
    );
    return;
  }

  // Para iconos/manifest: cache first con fallback a red.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone)).catch(() => null);
        return response;
      });
    })
  );
});
