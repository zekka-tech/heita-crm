"use client";

import dynamic from "next/dynamic";

const PostHogProvider = dynamic(
  () => import("./posthog-provider").then((m) => m.PostHogProvider),
  { ssr: false }
);
const WebVitalsReporter = dynamic(
  () => import("./web-vitals").then((m) => m.WebVitalsReporter),
  { ssr: false }
);

export function AnalyticsProviders() {
  return (
    <>
      <PostHogProvider />
      <WebVitalsReporter />
    </>
  );
}
