import { afterEach, describe, expect, it, vi } from "vitest";

import { assertPublicHttpUrl, isDisallowedFetchAddress } from "@/lib/security";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

import { lookup } from "node:dns/promises";

const mockedLookup = vi.mocked(lookup);

afterEach(() => {
  vi.clearAllMocks();
});

describe("isDisallowedFetchAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "not-an-ip"
  ])("rejects %s", (ip) => {
    expect(isDisallowedFetchAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "allows public %s",
    (ip) => {
      expect(isDisallowedFetchAddress(ip)).toBe(false);
    }
  );
});

describe("assertPublicHttpUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com/x")).rejects.toThrow(/protocol/);
  });

  it("rejects embedded credentials", async () => {
    await expect(assertPublicHttpUrl("http://user:pass@example.com/")).rejects.toThrow(/credentials/);
  });

  it("rejects IP-literal hosts in private ranges without DNS", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /not publicly routable/
    );
    await expect(assertPublicHttpUrl("http://127.0.0.1:8080/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toThrow();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to a private address", async () => {
    mockedLookup.mockResolvedValue([{ address: "10.1.2.3", family: 4 }] as never);
    await expect(assertPublicHttpUrl("https://evil.example.com/")).rejects.toThrow(/non-public/);
  });

  it("allows hostnames that resolve only to public addresses", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertPublicHttpUrl("https://example.com/page")).resolves.toEqual(["93.184.216.34"]);
  });

  it("rejects when DNS resolution fails", async () => {
    mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicHttpUrl("https://nope.invalid/")).rejects.toThrow(/could not resolve/);
  });
});
