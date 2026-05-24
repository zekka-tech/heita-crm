import { describe, expect, it } from "vitest";

import { businessPlans, formatPlanLimit, formatZar, getBusinessPlan } from "@/lib/billing";

describe("billing helpers", () => {
  it("returns the expected default plan details", () => {
    expect(getBusinessPlan("FREE").name).toBe("Free");
    expect(businessPlans).toHaveLength(3);
  });

  it("formats rand values and unlimited plan limits safely", () => {
    expect(formatZar(1499)).toContain("R");
    expect(formatPlanLimit(null, "members")).toBe("Unlimited members");
    expect(formatPlanLimit(5000, "members")).toContain("5");
  });
});

