// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addToOutbox,
  getOutboxCount,
  getOutboxItems,
  removeOutboxItem,
  syncOutbox
} from "@/lib/offline-outbox";

const mockStore = new Map<string, unknown>();

function createMockStore() {
  const store = {
    add: vi.fn((value: unknown) => {
      const item = value as { id: string };
      mockStore.set(item.id, value);
      return { onerror: null };
    }),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn((id: string) => {
      mockStore.delete(id);
      return { onerror: null };
    }),
    getAll: vi.fn(() => {
      const items = Array.from(mockStore.values());
      const noop = null as (() => void) | null;
      return { result: items, onsuccess: noop, onerror: null };
    }),
    count: vi.fn(() => {
      const noop = null as (() => void) | null;
      return { result: mockStore.size, onsuccess: noop, onerror: null };
    })
  };

  return store;
}

function eventTarget(initialResult: unknown) {
  let successCb: ((e: Event) => void) | null = null;
  const target = {
    result: initialResult,
    get onsuccess() { return successCb; },
    set onsuccess(cb: ((e: Event) => void) | null) {
      successCb = cb;
      if (cb) {
        Promise.resolve().then(() => cb({ target } as unknown as Event));
      }
    },
    onerror: null as ((e: Event) => void) | null,
    error: null as Error | null
  };
  return target;
}

let mockStoreInstance: ReturnType<typeof createMockStore>;

describe("offlineOutbox", () => {
  beforeEach(() => {
    mockStore.clear();
    mockStoreInstance = createMockStore();

    // Simulate IndexedDB open — fire onsuccess as microtask when handler is set
    const openRequest = eventTarget(null);

    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open: vi.fn(() => openRequest)
      },
      writable: true,
      configurable: true
    });

    // When openRequest.onsuccess fires, patch the result with a mock DB
    let dbOnsuccessSet = false;
    Object.defineProperty(openRequest, "onsuccess", {
      get() {
        return null;
      },
      set(cb: ((e: Event) => void) | null) {
        if (!dbOnsuccessSet) {
          dbOnsuccessSet = true;
          openRequest.result = {
            transaction: vi.fn(() => {
              let txOncomplete: (() => void) | null = null;
              const tx = {
                objectStore: vi.fn(() => mockStoreInstance),
                get oncomplete() { return txOncomplete; },
                set oncomplete(cb: (() => void) | null) {
                  txOncomplete = cb;
                  if (cb) {
                    Promise.resolve().then(() => cb());
                  }
                },
                onerror: null as (() => void) | null,
                onabort: null as (() => void) | null,
                error: null as Error | null
              };
              return tx;
            }),
            close: vi.fn(),
            objectStoreNames: { contains: vi.fn(() => true) }
          };
        }
        if (cb) {
          Promise.resolve().then(() => cb({ target: openRequest } as unknown as Event));
        }
      },
      configurable: true
    });

    // Patch store.getAll to trigger onsuccess as microtask
    mockStoreInstance.getAll.mockImplementation(() => {
      const items = Array.from(mockStore.values());
      let successCallback: (() => void) | null = null;
      return {
        result: items,
        get onsuccess() { return successCallback; },
        set onsuccess(cb: (() => void) | null) {
          successCallback = cb;
          if (cb) {
            Promise.resolve().then(() => cb());
          }
        },
        onerror: null
      };
    });

    // Patch store.count similarly
    mockStoreInstance.count.mockImplementation(() => {
      let successCallback: (() => void) | null = null;
      return {
        result: mockStore.size,
        get onsuccess() { return successCallback; },
        set onsuccess(cb: (() => void) | null) {
          successCallback = cb;
          if (cb) {
            Promise.resolve().then(() => cb());
          }
        },
        onerror: null
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("addToOutbox", () => {
    it("stores an item and returns its id", async () => {
      const id = await addToOutbox({
        type: "earn_points",
        payload: { businessId: "biz_1", points: 50 },
        idempotencyKey: "idem-001"
      });

      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("stores items with correct structure", async () => {
      await addToOutbox({
        type: "scan_receipt",
        payload: { businessId: "biz_2", imageData: "base64..." },
        idempotencyKey: "idem-002"
      });

      const stored = mockStoreInstance.add.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(stored).toBeTruthy();
      if (stored) {
        expect(stored.type).toBe("scan_receipt");
        expect(stored.idempotencyKey).toBe("idem-002");
        expect(stored.timestamp).toBeTypeOf("number");
      }
    });
  });

  describe("getOutboxCount", () => {
    it("returns zero when empty", async () => {
      const count = await getOutboxCount();
      expect(count).toBe(0);
    });

    it("returns correct count after adding items", async () => {
      mockStore.set("item-1", {
        id: "item-1",
        type: "earn_points",
        payload: {},
        idempotencyKey: "k1",
        timestamp: 1
      });
      mockStore.set("item-2", {
        id: "item-2",
        type: "scan_receipt",
        payload: {},
        idempotencyKey: "k2",
        timestamp: 2
      });

      const count = await getOutboxCount();
      expect(count).toBe(2);
    });
  });

  describe("getOutboxItems", () => {
    it("returns items sorted by timestamp", async () => {
      mockStore.set("b", {
        id: "b",
        type: "earn_points",
        payload: {},
        idempotencyKey: "k-b",
        timestamp: 200
      });
      mockStore.set("a", {
        id: "a",
        type: "earn_points",
        payload: {},
        idempotencyKey: "k-a",
        timestamp: 100
      });

      const items = await getOutboxItems();
      expect(items).toHaveLength(2);
      expect(items[0]?.id).toBe("a");
      expect(items[1]?.id).toBe("b");
    });
  });

  describe("removeOutboxItem", () => {
    it("removes an item from the store", async () => {
      mockStore.set("item-1", {
        id: "item-1",
        type: "earn_points",
        payload: {},
        idempotencyKey: "k1",
        timestamp: 1
      });

      await removeOutboxItem("item-1");
      expect(mockStoreInstance.delete).toHaveBeenCalledWith("item-1");
    });
  });

  describe("syncOutbox", () => {
    it("returns zero synced when outbox is empty", async () => {
      const result = await syncOutbox();
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });
});
