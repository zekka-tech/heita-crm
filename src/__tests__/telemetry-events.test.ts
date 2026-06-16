import { describe, expect, it } from "vitest";

import { buildLeadAttribution } from "@/lib/telemetry-events";

describe("buildLeadAttribution", () => {
  it("returns an empty object when no dimensions are supplied", () => {
    expect(buildLeadAttribution({})).toEqual({});
    expect(buildLeadAttribution({ source: "", medium: "  ", campaign: null })).toEqual({});
  });

  it("includes only the populated dimensions, trimmed", () => {
    expect(
      buildLeadAttribution({ source: "  google ", medium: undefined, campaign: "winter" })
    ).toEqual({ leadSource: "google", leadCampaign: "winter" });
  });

  it("caps overly long values to 120 characters", () => {
    const long = "a".repeat(200);
    expect(buildLeadAttribution({ source: long }).leadSource).toHaveLength(120);
  });
});
