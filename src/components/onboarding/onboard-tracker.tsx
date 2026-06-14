"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";

import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";

/**
 * Client-side onboarding telemetry via posthog-js.
 *
 * All captures are guarded by `posthog.__loaded` so we never fire events
 * before the user has accepted cookies (POPIA compliance).
 *
 * Server-side events (completed, error) are sent from the server action
 * via `captureEvent` in @/lib/telemetry.
 */

export function OnboardTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current || !posthog.__loaded) return;
    tracked.current = true;
    posthog.capture(TELEMETRY_EVENTS.onboardingPageViewed);
  }, []);

  return null;
}

/** Call from form step transitions to track multi-step onboarding progress. */
export function trackOnboardStep(step: string, properties?: Record<string, unknown>) {
  if (!posthog.__loaded) return;
  posthog.capture(TELEMETRY_EVENTS.onboardingStep, { step, ...properties });
}

/** Called from the client when the form submission is initiated. */
export function trackOnboardComplete(businessName: string) {
  if (!posthog.__loaded) return;
  posthog.capture(TELEMETRY_EVENTS.onboardingCompleted, { businessName });
}

/** Called from the client when a form error is surfaced. */
export function trackOnboardError(error: string, step: string) {
  if (!posthog.__loaded) return;
  posthog.capture(TELEMETRY_EVENTS.onboardingError, { error, step });
}
