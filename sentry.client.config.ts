import * as Sentry from "@sentry/nextjs";

import { SENTRY_COMMON, buildSentryBeforeSend } from "@/lib/sentry-config";

if (SENTRY_COMMON.enabled) {
  Sentry.init({
    ...SENTRY_COMMON,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    replaysSessionSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE ?? "0"
    ),
    replaysOnErrorSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE ?? "0.5"
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeSend: buildSentryBeforeSend() as any
  });
}
