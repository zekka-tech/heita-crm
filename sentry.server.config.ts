import * as Sentry from "@sentry/nextjs";

import { SENTRY_COMMON, buildSentryBeforeSend } from "@/lib/sentry-config";

if (SENTRY_COMMON.enabled) {
  Sentry.init({
    ...SENTRY_COMMON,
    beforeSend: buildSentryBeforeSend()
  });
}
