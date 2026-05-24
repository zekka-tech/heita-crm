import { describe, expect, it } from "vitest";

import {
  generateRequestId,
  isValidRequestId,
  requestIdHeader,
  resolveRequestId
} from "@/lib/request-context";

describe("request-context", () => {
  it("exposes the canonical header name", () => {
    expect(requestIdHeader).toBe("x-request-id");
  });

  it("accepts well-formed inbound IDs", () => {
    const headers = new Headers({ "x-request-id": "abc-123_xyz" });
    expect(resolveRequestId(headers)).toBe("abc-123_xyz");
  });

  it("falls back to a generated UUID when the header is missing", () => {
    const headers = new Headers();
    const id = resolveRequestId(headers);
    expect(isValidRequestId(id)).toBe(true);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects unsafe values and regenerates", () => {
    const headers = new Headers({ "x-request-id": "../../etc/passwd" });
    expect(resolveRequestId(headers)).not.toBe("../../etc/passwd");
  });

  it("rejects overly long IDs", () => {
    expect(isValidRequestId("x".repeat(80))).toBe(false);
  });

  it("generateRequestId returns RFC 4122 UUIDs", () => {
    expect(generateRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
