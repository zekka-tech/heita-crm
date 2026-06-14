import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";

const ORIGINAL_ENV = process.env;

describe("server telemetry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T01:02:03.000Z"));
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = ORIGINAL_ENV;
  });

  it("does not capture when PostHog is not configured", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { captureEvent } = await import("@/lib/telemetry");
    const { TELEMETRY_EVENTS } = await import("@/lib/telemetry-events");

    captureEvent({
      userId: "user_1",
      event: TELEMETRY_EVENTS.loyaltyPointsEarned,
      properties: { businessId: "biz_1", points: 10 }
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hashes the distinct id and captures typed properties", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://posthog.test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { captureEvent, distinctId } = await import("@/lib/telemetry");
    const { TELEMETRY_EVENTS } = await import("@/lib/telemetry-events");

    captureEvent({
      userId: "user_1",
      event: TELEMETRY_EVENTS.onboardingError,
      properties: {
        error: "failed"
      }
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://posthog.test/capture/", expect.objectContaining({
      method: "POST",
      cache: "no-store"
    }));

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const body = JSON.parse(firstCall?.[1].body as string);
    expect(body).toEqual(expect.objectContaining({
      api_key: "ph_test",
      event: TELEMETRY_EVENTS.onboardingError,
      distinct_id: distinctId("user_1"),
      timestamp: "2026-06-14T01:02:03.000Z"
    }));
    expect(body.distinct_id).not.toContain("user_1");
    expect(body.properties).toEqual({ error: "failed" });
  });

  it("recursively scrubs PII and URL query strings", async () => {
    const { scrubTelemetryProperties } = await import("@/lib/telemetry-events");

    expect(scrubTelemetryProperties({
      email: "alice@example.com",
      nested: { phone: "+27821234567", safe: "ok" },
      links: [{ url: "https://app.test/path?token=secret#frag" }]
    })).toEqual({
      email: "[redacted]",
      nested: { phone: "[redacted]", safe: "ok" },
      links: [{ url: "https://app.test/path" }]
    });
  });

  it("never surfaces rejected PostHog requests", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { captureEvent } = await import("@/lib/telemetry");
    const { TELEMETRY_EVENTS } = await import("@/lib/telemetry-events");

    expect(() => captureEvent({
      userId: "user_1",
      event: TELEMETRY_EVENTS.loyaltyPointsEarned,
      properties: { businessId: "biz_1", points: 5 }
    })).not.toThrow();
  });
});

// ── Event taxonomy contract ──────────────────────────────────────────────────
// Asserts that every required funnel event name is a non-empty string constant.
// These names are the data contract between the app and the PostHog/CAC dashboard
// (dashboards/heita-cac-ltv.json). If any constant is removed or renamed this
// test fails immediately — preventing silent breakage of downstream analytics.
describe("TELEMETRY_EVENTS funnel taxonomy", () => {
  const REQUIRED_FUNNEL_EVENTS: (keyof typeof TELEMETRY_EVENTS)[] = [
    "businessJoined",
    "pointsEarned",
    "pointsRedeemed",
    "tierUpgraded",
    "subscriptionStarted",
    "subscriptionUpgraded",
    "aiMessageSent",
  ];

  it("all required funnel event constants are non-empty strings", () => {
    for (const key of REQUIRED_FUNNEL_EVENTS) {
      const value = TELEMETRY_EVENTS[key];
      expect(typeof value, `TELEMETRY_EVENTS.${key} must be a string`).toBe("string");
      expect(value.length, `TELEMETRY_EVENTS.${key} must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("funnel event names match the documented PostHog taxonomy", () => {
    expect(TELEMETRY_EVENTS.businessJoined).toBe("business_joined");
    expect(TELEMETRY_EVENTS.pointsEarned).toBe("points_earned");
    expect(TELEMETRY_EVENTS.pointsRedeemed).toBe("points_redeemed");
    expect(TELEMETRY_EVENTS.tierUpgraded).toBe("tier_upgraded");
    expect(TELEMETRY_EVENTS.subscriptionStarted).toBe("subscription_started");
    expect(TELEMETRY_EVENTS.subscriptionUpgraded).toBe("subscription_upgraded");
    expect(TELEMETRY_EVENTS.aiMessageSent).toBe("ai_message_sent");
  });
});
