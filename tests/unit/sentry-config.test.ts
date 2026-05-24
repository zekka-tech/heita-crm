import { describe, expect, it } from "vitest";

import { buildSentryBeforeSend, sentryConfigured } from "@/lib/sentry-config";

describe("sentryConfigured", () => {
  it("returns false when DSN is unset", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(sentryConfigured()).toBe(false);
  });
});

describe("buildSentryBeforeSend", () => {
  const beforeSend = buildSentryBeforeSend();

  it("redacts auth headers and cookies", () => {
    const event = beforeSend(
      {
        request: {
          headers: {
            authorization: "Bearer real-token",
            "x-hub-signature-256": "sha256=secret",
            "user-agent": "Mozilla/5.0"
          },
          cookies: {
            session: "abc"
          }
        }
      } as Parameters<typeof beforeSend>[0]
    );

    expect(event?.request?.headers?.authorization).toBe("[redacted]");
    expect(event?.request?.headers?.["x-hub-signature-256"]).toBe("[redacted]");
    expect(event?.request?.headers?.["user-agent"]).toBe("Mozilla/5.0");
  });

  it("strips email and phone from the user", () => {
    const event = beforeSend(
      {
        user: { id: "user_1", email: "x@y.z", username: "x" }
      } as Parameters<typeof beforeSend>[0]
    );

    expect(event?.user).toEqual({ id: "user_1" });
  });

  it("redacts nested secret-like keys in extra/contexts", () => {
    const event = beforeSend(
      {
        extra: {
          payload: {
            code: "123456",
            phone: "+27821234567"
          }
        },
        contexts: {
          auth: { access_token: "tok" }
        }
      } as Parameters<typeof beforeSend>[0]
    );

    expect(
      (event?.extra?.payload as { code?: string; phone?: string } | undefined)?.code
    ).toBe("[redacted]");
    expect(
      (event?.contexts?.auth as { access_token?: string } | undefined)?.access_token
    ).toBe("[redacted]");
  });
});
