import { describe, expect, it } from "vitest";

import {
  operatorsForFieldType,
  validateSegmentRules
} from "@/lib/segments";

describe("operatorsForFieldType", () => {
  it("offers comparison operators for numeric fields", () => {
    const ops = operatorsForFieldType("number").map((o) => o.value);
    expect(ops).toEqual(["eq", "not_eq", "gt", "gte", "lt", "lte"]);
  });

  it("restricts text fields to equality operators", () => {
    const ops = operatorsForFieldType("text").map((o) => o.value);
    expect(ops).toEqual(["eq", "not_eq"]);
  });
});

describe("validateSegmentRules", () => {
  it("coerces numeric values and defaults matchAll to true", () => {
    const result = validateSegmentRules({
      rules: [{ field: "totalSpent", operator: "gte", value: "500" }]
    });
    expect(result).toEqual({
      matchAll: true,
      rules: [{ field: "totalSpent", operator: "gte", value: 500 }]
    });
  });

  it("trims text values and respects matchAll: false", () => {
    const result = validateSegmentRules({
      matchAll: false,
      rules: [{ field: "tier", operator: "eq", value: "  Gold  " }]
    });
    expect(result).toEqual({
      matchAll: false,
      rules: [{ field: "tier", operator: "eq", value: "Gold" }]
    });
  });

  it("rejects an empty rule set", () => {
    expect(() => validateSegmentRules({ rules: [] })).toThrow(/at least one rule/i);
  });

  it("rejects an unknown field", () => {
    expect(() =>
      validateSegmentRules({ rules: [{ field: "ssn", operator: "eq", value: "x" }] })
    ).toThrow(/unknown field/i);
  });

  it("rejects a numeric-only operator on a text field", () => {
    expect(() =>
      validateSegmentRules({
        rules: [{ field: "tier", operator: "gt", value: "Gold" }]
      })
    ).toThrow(/numeric fields/i);
  });

  it("rejects a non-numeric value for a numeric field", () => {
    expect(() =>
      validateSegmentRules({
        rules: [{ field: "pointsBalance", operator: "gte", value: "lots" }]
      })
    ).toThrow(/numeric value/i);
  });

  it("rejects a blank value for a text field", () => {
    expect(() =>
      validateSegmentRules({
        rules: [{ field: "province", operator: "eq", value: "   " }]
      })
    ).toThrow(/needs a value/i);
  });

  it("rejects more than the maximum number of rules", () => {
    const rules = Array.from({ length: 11 }, () => ({
      field: "visitCount",
      operator: "gte",
      value: 1
    }));
    expect(() => validateSegmentRules({ rules })).toThrow(/at most 10 rules/i);
  });
});
