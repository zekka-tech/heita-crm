import { describe, expect, it } from "vitest";

import { isE164, maskPhone, normalizeZaPhone } from "@/lib/phone";

describe("normalizeZaPhone", () => {
  it("normalises local format starting with 0", () => {
    expect(normalizeZaPhone("0821234567")).toBe("+27821234567");
  });

  it("normalises with spaces and dashes", () => {
    expect(normalizeZaPhone("082 123-4567")).toBe("+27821234567");
  });

  it("keeps existing E.164 numbers unchanged", () => {
    expect(normalizeZaPhone("+27821234567")).toBe("+27821234567");
  });

  it("normalises 00 international prefix", () => {
    expect(normalizeZaPhone("0027821234567")).toBe("+27821234567");
  });

  it("returns null on empty input", () => {
    expect(normalizeZaPhone("")).toBeNull();
  });

  it("returns null on too short input", () => {
    expect(normalizeZaPhone("123")).toBeNull();
  });

  it("returns null on absurd lengths", () => {
    expect(normalizeZaPhone("+27" + "1".repeat(20))).toBeNull();
  });
});

describe("isE164", () => {
  it("accepts +27821234567", () => {
    expect(isE164("+27821234567")).toBe(true);
  });

  it("rejects 082...", () => {
    expect(isE164("0821234567")).toBe(false);
  });
});

describe("maskPhone", () => {
  it("masks middle digits", () => {
    expect(maskPhone("+27821234567")).toBe("+278***67");
  });

  it("returns short values unchanged", () => {
    expect(maskPhone("12345")).toBe("12345");
  });
});
