"use client";

import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";

import { scrubTelemetryProperties, TELEMETRY_EVENTS } from "@/lib/telemetry-events";

/**
 * Sends Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to PostHog.
 * Only fires when posthog-js is already initialised (i.e. user has consented).
 * Mount once in the root layout via next/dynamic (ssr: false).
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!posthog.__loaded) return;
    posthog.capture(TELEMETRY_EVENTS.webVitals, scrubTelemetryProperties({
      metric_name: metric.name,
      // Round to avoid floating point noise in dashboards.
      metric_value: Math.round(metric.value),
      metric_rating: metric.rating,
      metric_id: metric.id,
      $current_url: window.location.href,
    }));
  });

  return null;
}
