// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_CONSENT_STORAGE_KEY } from "@/lib/cookie-consent";

const posthogMock = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
  capture: vi.fn(),
  debug: vi.fn()
}));
const webVitalsMock = vi.hoisted(() => ({
  useReportWebVitals: vi.fn()
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));
vi.mock("next/web-vitals", () => ({
  useReportWebVitals: webVitalsMock.useReportWebVitals
}));

const { PostHogProvider } = await import("@/components/providers/posthog-provider");
const { WebVitalsReporter } = await import("@/components/providers/web-vitals");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  posthogMock.__loaded = false;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://posthog.test";
});

describe("PostHogProvider", () => {
  it("does not initialise PostHog before cookie consent", async () => {
    render(<PostHogProvider />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it("initialises PostHog after accepted consent and scrubs browser properties", async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");

    render(<PostHogProvider />);

    await waitFor(() => expect(posthogMock.init).toHaveBeenCalledOnce());
    const firstCall = posthogMock.init.mock.calls[0];
    expect(firstCall).toBeDefined();
    const options = firstCall?.[1];
    expect(posthogMock.init).toHaveBeenCalledWith("ph_test", expect.objectContaining({
      api_host: "https://posthog.test",
      autocapture: false,
      disable_session_recording: true
    }));
    expect(options?.sanitize_properties({
      phone: "+27821234567",
      nested: { email: "a@example.com" },
      $current_url: "https://app.test/wallet?token=secret#frag"
    })).toEqual({
      phone: "[redacted]",
      nested: { email: "[redacted]" },
      $current_url: "https://app.test/wallet"
    });
  });
});

describe("WebVitalsReporter", () => {
  it("does not capture web vitals unless PostHog is loaded", () => {
    webVitalsMock.useReportWebVitals.mockImplementation((callback: (metric: {
      name: string;
      value: number;
      rating: string;
      id: string;
    }) => void) => {
      callback({ name: "LCP", value: 1234.56, rating: "good", id: "metric_1" });
    });

    render(<WebVitalsReporter />);

    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("captures rounded web vitals when PostHog is loaded", () => {
    posthogMock.__loaded = true;
    window.history.pushState({}, "", "/wallet?token=secret#frag");
    webVitalsMock.useReportWebVitals.mockImplementation((callback: (metric: {
      name: string;
      value: number;
      rating: string;
      id: string;
    }) => void) => {
      callback({ name: "INP", value: 49.6, rating: "good", id: "metric_2" });
    });

    render(<WebVitalsReporter />);

    expect(posthogMock.capture).toHaveBeenCalledWith("$web_vitals", {
      metric_name: "INP",
      metric_value: 50,
      metric_rating: "good",
      metric_id: "metric_2",
      $current_url: "http://localhost:3000/wallet"
    });
  });
});
