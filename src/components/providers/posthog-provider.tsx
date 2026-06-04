"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import { readCookieConsent } from "@/lib/cookie-consent";

const REDACTED_KEYS = new Set([
  "phone",
  "email",
  "token",
  "otp",
  "secret",
  "password",
  "$email",
  "$phone",
  "$name",
]);

function sanitize(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}

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
      sanitize_properties: sanitize,
      // Disable session recording unless explicitly enabled via feature flag.
      disable_session_recording: true,
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") ph.debug();
      },
    });
  }, []);

  return null;
}
