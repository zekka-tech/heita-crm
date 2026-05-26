import * as Sentry from "@sentry/nextjs";

import { SENTRY_COMMON, buildSentryBeforeSend } from "@/lib/sentry-config";

if (SENTRY_COMMON.enabled) {
  Sentry.init({
    ...SENTRY_COMMON,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeSend: buildSentryBeforeSend() as any
  });
}
