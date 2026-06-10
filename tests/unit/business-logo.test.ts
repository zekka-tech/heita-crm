import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { storage, scan } = vi.hoisted(() => ({
  storage: {
    storageConfigured: vi.fn(() => true),
    putStoredObject: vi.fn(async () => ({ key: "k", url: null })),
    getStoredObjectUrl: vi.fn(() => "https://cdn.example/business-logos/x.png"),
    deleteStoredObject: vi.fn(async () => undefined)
  },
  scan: {
    scanStoredObjectForMalware: vi.fn(async () => ({ verdict: "clean", details: "ok" }))
  }
}));
vi.mock("@/lib/storage", () => storage);
vi.mock("@/lib/malware-scan", () => scan);

import { uploadBusinessLogo } from "@/server/services/business.service";

function imageFile(type: string, bytes = 16, name = "logo.png") {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("uploadBusinessLogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.storageConfigured.mockReturnValue(true);
    storage.getStoredObjectUrl.mockReturnValue("https://cdn.example/business-logos/x.png");
    scan.scanStoredObjectForMalware.mockResolvedValue({ verdict: "clean", details: "ok" });
  });

  it("rejects a non-image content type", async () => {
    await expect(uploadBusinessLogo(imageFile("text/plain"))).rejects.toThrow(/PNG, JPEG, or WebP/);
    expect(storage.putStoredObject).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    await expect(uploadBusinessLogo(imageFile("image/png", 0))).rejects.toThrow(/empty/);
  });

  it("rejects a file larger than 2 MB", async () => {
    await expect(
      uploadBusinessLogo(imageFile("image/png", 2 * 1024 * 1024 + 1))
    ).rejects.toThrow(/2 MB/);
  });

  it("rejects when storage is not configured", async () => {
    storage.storageConfigured.mockReturnValue(false);
    await expect(uploadBusinessLogo(imageFile("image/jpeg"))).rejects.toThrow(/not configured/);
  });

  it("uploads, scans, and returns the public URL on success", async () => {
    const url = await uploadBusinessLogo(imageFile("image/png"));
    expect(url).toBe("https://cdn.example/business-logos/x.png");
    expect(storage.putStoredObject).toHaveBeenCalledTimes(1);
    expect(scan.scanStoredObjectForMalware).toHaveBeenCalledTimes(1);
    expect(storage.putStoredObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^business-logos\/.+\.png$/),
        contentType: "image/png"
      })
    );
  });

  it("deletes the object and throws when the scan reports infected", async () => {
    scan.scanStoredObjectForMalware.mockResolvedValue({ verdict: "infected", details: "bad" });
    await expect(uploadBusinessLogo(imageFile("image/webp", 16, "x.webp"))).rejects.toThrow(
      /malware scan/
    );
    expect(storage.deleteStoredObject).toHaveBeenCalledTimes(1);
  });
});
