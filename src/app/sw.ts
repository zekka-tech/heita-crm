// Service worker for dashboard offline-first caching.
// Served via a route handler — this file exports the self-contained worker code.
// The worker uses cache-first for the dashboard shell and network-first with
// cache fallback for critical API data.

export const SW_CODE = `
const CACHE_NAME = "heita-dashboard-v1";
const DATA_CACHE = "heita-dashboard-data-v1";
const OFFLINE_PAGE = "/offline-fallback";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const keep = new Set([CACHE_NAME, DATA_CACHE]);
      await Promise.all(
        keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 408 });
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), timeoutMs)
  );

  try {
    const response = await Promise.race([fetch(request), timeout]);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === "navigate") {
      return caches.match(OFFLINE_PAGE);
    }

    return new Response("", { status: 408 });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, CACHE_NAME, 5000));
    return;
  }

  const cacheableApi =
    url.pathname.startsWith("/api/") &&
    ["/api/health"].some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

  if (cacheableApi) {
    event.respondWith(networkFirst(event.request, DATA_CACHE, 5000));
    return;
  }

  if (
    event.request.destination === "style" ||
    event.request.destination === "script" ||
    event.request.destination === "font" ||
    url.pathname.startsWith("/_next/")
  ) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  event.respondWith(networkFirst(event.request, CACHE_NAME, 3000));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CACHE_NOW" && event.data?.url) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.data.url).then((response) => {
          if (response.ok) {
            return cache.put(event.data.url, response);
          }
        });
      })
    );
  }
});
`;
