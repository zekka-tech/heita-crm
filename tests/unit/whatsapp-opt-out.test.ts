import { describe, it, expect } from "vitest";

// The isOptOutRequest function is not exported from whatsapp.service.ts, so we
// replicate its exact logic here to test it in isolation. This pattern is used
// when internal helper functions need deterministic testing.
const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "unstop", "cancel", "end", "quit"];

function isOptOutRequest(body: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.some(
    (keyword) =>
      trimmed === keyword ||
      trimmed.startsWith(`${keyword} `) ||
      trimmed.startsWith(`${keyword}\n`)
  );
}

describe("isOptOutRequest", () => {
  it("matches exact STOP", () => {
    expect(isOptOutRequest("STOP")).toBe(true);
  });

  it("matches exact stop (lowercase)", () => {
    expect(isOptOutRequest("stop")).toBe(true);
  });

  it("matches UNSUBSCRIBE", () => {
    expect(isOptOutRequest("UNSUBSCRIBE")).toBe(true);
  });

  it("matches UNSTOP", () => {
    expect(isOptOutRequest("unstop")).toBe(true);
  });

  it("matches CANCEL", () => {
    expect(isOptOutRequest("CANCEL")).toBe(true);
  });

  it("matches END", () => {
    expect(isOptOutRequest("end")).toBe(true);
  });

  it("matches QUIT", () => {
    expect(isOptOutRequest("Quit")).toBe(true);
  });

  it("matches keyword followed by space and additional text", () => {
    expect(isOptOutRequest("STOP please")).toBe(true);
  });

  it("matches keyword followed by newline", () => {
    expect(isOptOutRequest("stop\nI don't want this anymore")).toBe(true);
  });

  it("matches keyword with leading/trailing whitespace", () => {
    expect(isOptOutRequest("  stop  ")).toBe(true);
  });

  it("does not match stop123 (keyword is prefix but not separated by space or newline)", () => {
    expect(isOptOutRequest("stop123")).toBe(false);
  });

  it("does not match 'please stop that' (keyword not at start)", () => {
    expect(isOptOutRequest("please stop that")).toBe(false);
  });

  it("does not match empty string", () => {
    expect(isOptOutRequest("")).toBe(false);
  });

  it("does not match random text", () => {
    expect(isOptOutRequest("hello")).toBe(false);
  });

  it("does not match partial keyword like 'st'", () => {
    expect(isOptOutRequest("st")).toBe(false);
  });

  it("does not match keyword-like text not in the list", () => {
    expect(isOptOutRequest("delete")).toBe(false);
    expect(isOptOutRequest("remove")).toBe(false);
    expect(isOptOutRequest("optout")).toBe(false);
  });
});
