"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import { readCookieConsent } from "@/lib/cookie-consent";
import { scrubTelemetryProperties } from "@/lib/telemetry-events";

/**
 * Initialises PostHog on the client only after the user has accepted cookies
 * (POPIA compliance). Reads consent from localStorage so the check is
 * synchronous and never causes a flash of un-tracked state.
 *
 * Mount this once in the root layout. Lazy-loaded via next/dynamic so the
 * posthog-js bundle does not land in the initial HTML payload.
 */
export function PostHogProvider() {
  useEffect(() => {
    const consent = readCookieConsent();
    if (consent !== "accepted") return;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
    if (!key || posthog.__loaded) return;

    posthog.init(key, {
      api_host: host,
      ui_host: "https://app.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      persistence: "localStorage+cookie",
      cookie_name: "_ph_heita",
      // Strip PII from every event before it leaves the browser.
      sanitize_properties: scrubTelemetryProperties,
      // Disable session recording unless explicitly enabled via feature flag.
      disable_session_recording: true,
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") ph.debug();
      },
    });
  }, []);

  return null;
}
