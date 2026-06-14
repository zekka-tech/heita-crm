// Service worker for dashboard offline-first caching + offline outbox (W7 POC).
// Served via a route handler — this file exports the self-contained worker code.
//
// Offline outbox: POST requests to /api/loyalty/earn and /api/receipts/submit
// that fail due to network unavailability are queued in IndexedDB and replayed
// on reconnect via the Background Sync API (or a manual sync on online event).

export const SW_CODE = `
const CACHE_NAME = "heita-dashboard-v2";
const DATA_CACHE = "heita-dashboard-data-v2";
const OFFLINE_QUEUE_DB = "heita-offline-queue";
const OFFLINE_QUEUE_STORE = "pending-writes";

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

// ---------------------------------------------------------------------------
// IndexedDB outbox helpers
// ---------------------------------------------------------------------------

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        db.createObjectStore(OFFLINE_QUEUE_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueWrite(entry) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
    tx.objectStore(OFFLINE_QUEUE_STORE).add(entry);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPendingWrites() {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
    const req = tx.objectStore(OFFLINE_QUEUE_STORE).getAll();
    req.onsuccess = () => {
      const keysReq = tx.objectStore(OFFLINE_QUEUE_STORE).getAllKeys();
      keysReq.onsuccess = () => {
        const keys = keysReq.result;
        resolve(req.result.map((val, i) => ({ key: keys[i], ...val })));
      };
      keysReq.onerror = () => reject(keysReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function deleteOutboxEntry(key) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
    tx.objectStore(OFFLINE_QUEUE_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Offline outbox: replay pending writes on reconnect
// ---------------------------------------------------------------------------

async function replayOutbox() {
  const pending = await getAllPendingWrites();
  if (pending.length === 0) return;

  const results = await Promise.allSettled(
    pending.map(async (entry) => {
      const resp = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        credentials: "include"
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      await deleteOutboxEntry(entry.key);
      return entry;
    })
  );

  const replayed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  // Notify all open clients about the sync result.
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({
      type: "OUTBOX_SYNCED",
      replayed,
      failed,
      remaining: failed
    });
  }
}

// Background Sync API (where supported).
self.addEventListener("sync", (event) => {
  if (event.tag === "heita-offline-writes") {
    event.waitUntil(replayOutbox());
  }
});

// Fallback: replay on every fetch when online (catches browsers without Background Sync).
let syncScheduled = false;
async function scheduleReplay() {
  if (syncScheduled) return;
  syncScheduled = true;
  await replayOutbox().catch(() => undefined);
  syncScheduled = false;
}

// ---------------------------------------------------------------------------
// Caching strategies
// ---------------------------------------------------------------------------

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
      // On a successful network response, attempt to drain the outbox.
      scheduleReplay().catch(() => undefined);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === "navigate") {
      return caches.match(OFFLINE_PAGE) ?? new Response("Offline", { status: 503 });
    }

    return new Response("", { status: 408 });
  }
}

// Outbox-aware POST handler for the two highest-value offline writes.
const OUTBOX_PATHS = ["/api/loyalty/earn", "/api/receipts/submit"];

async function handleOfflinePost(event) {
  const url = new URL(event.request.url);
  if (!OUTBOX_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    return fetch(event.request);
  }

  try {
    const response = await fetch(event.request.clone());
    if (response.ok) return response;
    throw new Error("HTTP " + response.status);
  } catch {
    // Network failed — queue the write for later replay.
    try {
      const body = await event.request.text();
      const headers = {};
      for (const [k, v] of event.request.headers.entries()) {
        headers[k] = v;
      }
      await enqueueWrite({
        url: event.request.url,
        method: event.request.method,
        headers,
        body,
        queuedAt: Date.now()
      });

      // Register for Background Sync if available.
      if (self.registration.sync) {
        await self.registration.sync.register("heita-offline-writes").catch(() => undefined);
      }

      // Return a 202 Accepted so the UI knows the write was queued.
      return new Response(
        JSON.stringify({ queued: true, message: "Write queued for sync when online." }),
        {
          status: 202,
          headers: { "Content-Type": "application/json", "X-Heita-Offline": "queued" }
        }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: "Offline and could not queue write." }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Fetch handler
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Intercept POST writes for offline outbox.
  if (event.request.method === "POST" && url.pathname.startsWith("/api/")) {
    event.respondWith(handleOfflinePost(event));
    return;
  }

  if (event.request.method !== "GET") return;

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

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

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
  // Manual sync trigger from the UI when the user comes back online.
  if (event.data?.type === "SYNC_NOW") {
    event.waitUntil(replayOutbox());
  }
  // Query pending outbox count.
  if (event.data?.type === "OUTBOX_COUNT") {
    getAllPendingWrites()
      .then((pending) => {
        if (event.source) {
          event.source.postMessage({ type: "OUTBOX_COUNT_RESULT", count: pending.length });
        }
      })
      .catch(() => undefined);
  }
});
`;
