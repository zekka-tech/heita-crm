type OutboxItemType = "earn_points" | "scan_receipt";

export type OutboxItem = {
  id: string;
  type: OutboxItemType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  timestamp: number;
};

const DB_NAME = "heita-offline-outbox";
const STORE_NAME = "outbox";
const DB_VERSION = 1;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

async function withStore(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | Promise<void>
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = fn(store);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    if (isIdbRequest(result)) {
      result.onerror = () => reject(result.error);
    }
  });
}

function isIdbRequest(value: unknown): value is { onerror: ((event: Event) => void) | null; error: Error | null } {
  return typeof value === "object" && value !== null && "onerror" in value && "error" in value;
}

export async function addToOutbox(item: Omit<OutboxItem, "id" | "timestamp">): Promise<string> {
  const id = generateId();
  const entry: OutboxItem = {
    id,
    type: item.type,
    payload: item.payload,
    idempotencyKey: item.idempotencyKey,
    timestamp: Date.now()
  };

  await withStore("readwrite", (store) => store.add(entry));
  return id;
}

export async function getOutboxItems(): Promise<OutboxItem[]> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const items = (request.result as OutboxItem[]).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          db.close();
          resolve(items);
        };

        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export async function removeOutboxItem(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function getOutboxCount(): Promise<number> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };

        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      })
      .catch(reject);
  });
}

export async function syncOutbox(): Promise<{
  synced: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error?: string }>;
}> {
  const items = await getOutboxItems();

  if (items.length === 0) {
    return { synced: 0, failed: 0, results: [] };
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  let synced = 0;
  let failed = 0;

  try {
    const response = await fetch("/api/sync/offline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });

    if (!response.ok) {
      return { synced: 0, failed: items.length, results };
    }

    const body = (await response.json()) as {
      results: Array<{ id: string; ok: boolean; error?: string }>;
    };

    for (const result of body.results ?? []) {
      results.push(result);
      if (result.ok) {
        await removeOutboxItem(result.id);
        synced += 1;
      } else {
        failed += 1;
      }
    }
  } catch {
    failed = items.length;
  }

  return { synced, failed, results };
}

export function setupOutboxSync(): () => void {
  const handleOnline = () => {
    syncOutbox().catch(() => undefined);
  };

  window.addEventListener("online", handleOnline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      syncOutbox().catch(() => undefined);
    }
  });

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
