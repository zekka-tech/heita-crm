import { describe, expect, it } from "vitest";

import { generateQrDataUrl, generateQrSvg } from "@/lib/qr";

describe("QR generation", () => {
  it("emits an SVG that includes the QR namespace", async () => {
    const svg = await generateQrSvg("https://heita.co.za/join/abc");
    expect(svg).toMatch(/<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/path/);
  });

  it("emits a data URL with base64 PNG body", async () => {
    const url = await generateQrDataUrl("https://heita.co.za/join/abc");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });
});
