const VERSION = "heita-v4";
const APP_SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const IMAGE_CACHE = `${VERSION}-images`;
const OFFLINE_URL = "/offline.html";
const APP_SHELL_ASSETS = ["/", OFFLINE_URL, "/manifest.json", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, DATA_CACHE, IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  try {
    const response = await Promise.race([fetch(request), timeout]);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (request.mode === "navigate") {
      return (await caches.match(OFFLINE_URL)) || Response.error();
    }

    return Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || network || Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, APP_SHELL_CACHE, 5000));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request, DATA_CACHE, 5000));
    return;
  }

  if (
    event.request.destination === "image" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/screenshots/")
  ) {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request, APP_SHELL_CACHE));
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title || "Heita", {
      body: payload.body || "",
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      data: {
        url: payload.url || "/notifications"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Background-sync: replay queued loyalty earn/redeem POSTs that failed offline
const SYNC_QUEUE_KEY = "heita-loyalty-queue";

self.addEventListener("sync", (event) => {
  if (event.tag === "loyalty-sync") {
    event.waitUntil(flushLoyaltyQueue());
  }
});

async function flushLoyaltyQueue() {
  const db = await openSyncDb();
  const tx = db.transaction(SYNC_QUEUE_KEY, "readwrite");
  const store = tx.objectStore(SYNC_QUEUE_KEY);
  const all = await idbAll(store);

  for (const item of all) {
    try {
      const resp = await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body)
      });
      if (resp.ok) {
        store.delete(item.id);
      }
    } catch {
      // Leave in queue for next sync attempt
    }
  }
  return tx.done;
}

function openSyncDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("heita-sync", 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(SYNC_QUEUE_KEY, {
        keyPath: "id",
        autoIncrement: true
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}
