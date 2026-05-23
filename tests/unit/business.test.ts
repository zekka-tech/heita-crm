import { describe, expect, it } from "vitest";

import { formatEnumLabel, slugifyBusinessName } from "@/lib/business";

describe("slugifyBusinessName", () => {
  it("lowercases and replaces spaces", () => {
    expect(slugifyBusinessName("Inky Shop Fourways")).toBe("inky-shop-fourways");
  });

  it("strips punctuation", () => {
    expect(slugifyBusinessName("Mpho's Corner Store!")).toBe(
      "mpho-s-corner-store"
    );
  });

  it("truncates long names", () => {
    const long = "a".repeat(80);
    expect(slugifyBusinessName(long).length).toBeLessThanOrEqual(48);
  });

  it("returns empty string when no chars survive", () => {
    expect(slugifyBusinessName("---")).toBe("");
  });
});

describe("formatEnumLabel", () => {
  it("capitalises words", () => {
    expect(formatEnumLabel("EASTERN_CAPE")).toBe("Eastern Cape");
    expect(formatEnumLabel("FOOD_BEVERAGE")).toBe("Food Beverage");
  });
});
