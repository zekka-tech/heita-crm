import { describe, expect, it } from "vitest";

import { businessPlans, getPlanQuota } from "@/lib/billing";

describe("billing tier snapshot", () => {
  it("has exactly 4 plans", () => {
    expect(businessPlans).toHaveLength(4);
  });

  it("plan IDs are FREE, STARTER, GROWTH, SCALE in order", () => {
    expect(businessPlans.map((p) => p.id)).toEqual(["FREE", "STARTER", "GROWTH", "SCALE"]);
  });

  it("monthly prices match the canonical pricing ladder", () => {
    const prices = businessPlans.map((p) => p.monthlyPriceZar);
    expect(prices).toEqual([0, 499, 1499, 4999]);
  });

  it("annual prices match the canonical pricing ladder", () => {
    const prices = businessPlans.map((p) => p.annualPriceZar);
    expect(prices).toEqual([0, 4990, 14990, 49990]);
  });

  it("all quota fields are present on every plan", () => {
    for (const plan of businessPlans) {
      const quota = plan.quota;
      expect(quota).toHaveProperty("maxMembers");
      expect(quota).toHaveProperty("maxStaff");
      expect(quota).toHaveProperty("extraSeatPriceZar");
      expect(quota).toHaveProperty("maxAiMessagesPerMonth");
      expect(quota).toHaveProperty("maxWaTemplatesPerMonth");
      expect(quota).toHaveProperty("maxInAppMessagesPerMonth");
      expect(quota).toHaveProperty("aiOveragePriceZar");
    }
  });

  it("paid tier quota fields are non-zero", () => {
    const paidPlans = businessPlans.filter((p) => p.monthlyPriceZar > 0);
    expect(paidPlans).toHaveLength(3);
    for (const plan of paidPlans) {
      const quota = plan.quota;
      expect(quota.maxMembers).not.toBeNull();
      expect(quota.maxMembers).toBeGreaterThan(0);
      expect(quota.maxStaff).not.toBeNull();
      expect(quota.maxStaff).toBeGreaterThan(0);
      expect(quota.maxAiMessagesPerMonth).not.toBeNull();
      expect(quota.maxAiMessagesPerMonth).toBeGreaterThan(0);
      expect(quota.maxWaTemplatesPerMonth).not.toBeNull();
      expect(quota.maxWaTemplatesPerMonth).toBeGreaterThan(0);
      expect(quota.maxInAppMessagesPerMonth).not.toBeNull();
      expect(quota.maxInAppMessagesPerMonth).toBeGreaterThan(0);
    }
  });

  it("overage price is R0.20 on every plan", () => {
    for (const plan of businessPlans) {
      expect(plan.quota.aiOveragePriceZar).toBe(0.20);
    }
  });

  it("getPlanQuota returns the correct quota for each plan", () => {
    expect(getPlanQuota("FREE").maxMembers).toBe(500);
    expect(getPlanQuota("STARTER").maxMembers).toBe(3_000);
    expect(getPlanQuota("GROWTH").maxMembers).toBe(10_000);
    expect(getPlanQuota("SCALE").maxMembers).toBe(100_000);
  });

  it("getPlanQuota falls back to FREE for unknown plan IDs", () => {
    expect(getPlanQuota(null).maxMembers).toBe(500);
    expect(getPlanQuota(undefined).maxMembers).toBe(500);
    expect(getPlanQuota("NONEXISTENT").maxMembers).toBe(500);
  });

  it("STARTER tier has correct quotas", () => {
    const quota = getPlanQuota("STARTER");
    expect(quota.maxMembers).toBe(3_000);
    expect(quota.maxStaff).toBe(3);
    expect(quota.maxAiMessagesPerMonth).toBe(1_500);
    expect(quota.maxWaTemplatesPerMonth).toBe(1_000);
    expect(quota.maxInAppMessagesPerMonth).toBe(1_000);
    expect(quota.extraSeatPriceZar).toBeNull();
  });

  it("GROWTH tier has correct quotas including extra seat price", () => {
    const quota = getPlanQuota("GROWTH");
    expect(quota.maxMembers).toBe(10_000);
    expect(quota.maxStaff).toBe(5);
    expect(quota.extraSeatPriceZar).toBe(149);
    expect(quota.maxAiMessagesPerMonth).toBe(5_000);
    expect(quota.maxWaTemplatesPerMonth).toBe(3_000);
    expect(quota.maxInAppMessagesPerMonth).toBe(5_000);
  });

  it("SCALE tier has correct quotas including extra seat price", () => {
    const quota = getPlanQuota("SCALE");
    // 100 000 is a soft-cap tracked in quota; limits.members is null (no hard block)
    expect(quota.maxMembers).toBe(100_000);
    expect(quota.maxStaff).toBe(25);
    expect(quota.extraSeatPriceZar).toBe(99);
    expect(quota.maxAiMessagesPerMonth).toBe(25_000);
    expect(quota.maxWaTemplatesPerMonth).toBe(20_000);
    expect(quota.maxInAppMessagesPerMonth).toBe(25_000);
  });
});
