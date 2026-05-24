import { describe, expect, it } from "vitest";

import {
  applyTierPointMultiplier,
  calculatePointsExpiryDate,
  describeTierPerks,
  getTierPerks
} from "@/lib/loyalty";

describe("loyalty helpers", () => {
  it("falls back safely when perks are invalid", () => {
    expect(getTierPerks("bad")).toEqual({});
    expect(describeTierPerks(null)).toEqual([]);
  });

  it("applies point multipliers and rounds to whole points", () => {
    expect(
      applyTierPointMultiplier({
        basePoints: 100,
        perks: { pointMultiplier: 1.25 }
      })
    ).toBe(125);
  });

  it("describes customer-visible perks", () => {
    expect(
      describeTierPerks({
        pointMultiplier: 1.1,
        freeDelivery: true,
        exclusiveAccess: true
      })
    ).toEqual(["1.10x points", "Free delivery", "Exclusive access"]);
  });

  it("calculates expiry dates from issue time", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(
      calculatePointsExpiryDate({
        issuedAt,
        expiryDays: 30
      })?.toISOString()
    ).toBe("2026-01-31T00:00:00.000Z");
    expect(calculatePointsExpiryDate({ issuedAt, expiryDays: 0 })).toBeNull();
  });
});
