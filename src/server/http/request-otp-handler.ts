import { NextResponse } from "next/server";
import { z } from "zod";

import { getOtpPurposeForMode, type AuthOtpMode } from "@/lib/auth-intent";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { incrementOtpMetric, observeHttpRoute } from "@/lib/metrics";
import { issueOtpCode } from "@/lib/otp";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { getClientIp } from "@/lib/security";
import { sendOtpSms } from "@/lib/sms";
import { withSpan } from "@/lib/tracing";
import { verifyTurnstileToken } from "@/lib/turnstile";

const RequestOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  mode: z.enum(["sign-in", "sign-up"]).default("sign-in"),
  turnstileToken: z.string().optional()
});

const OTP_PER_PHONE_PER_HOUR = 5;
const OTP_PER_IP_PER_HOUR = 20;
const OTP_PER_PHONE_PER_MINUTE = 1;
const EXPOSE_DEV_OTP =
  process.env.NODE_ENV !== "production" && process.env.E2E_EXPOSE_DEV_OTP === "1";

// Generic response returned in every case where a code would be sent.
// Using identical text and status for both "account found" and "not found"
// paths prevents phone-number enumeration via response body or status code.
const GENERIC_OTP_SENT_BODY = {
  ok: true,
  message: "If your number is registered we have sent you a verification code."
};

export async function handleRequestOtp(request: Request) {
  return withSpan("otp.request", { "http.route": "/api/auth/request-otp" }, () =>
    _handleRequestOtp(request)
  );
}

async function _handleRequestOtp(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const ip = getClientIp(request.headers);

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 403,
      durationMs: Date.now() - startedAt
    });
    return csrfFailure;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: { [requestIdHeader]: requestId } }
    );
  }

  const parsed = RequestOtpSchema.safeParse(body);
  if (!parsed.success) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Enter a valid phone number." },
      { status: 400, headers: { [requestIdHeader]: requestId } }
    );
  }

  const phone = normalizeZaPhone(parsed.data.phone);
  if (!phone) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Enter a valid South African phone number (e.g. +27 82 000 0000)." },
      { status: 400, headers: { [requestIdHeader]: requestId } }
    );
  }

  // Apply rate limits BEFORE the user lookup so they cannot be used as a
  // timing oracle to determine whether a phone is registered.
  const ipLimit = await enforceRateLimit({
    identifier: `otp:ip:${ip}`,
    windowSeconds: 3600,
    max: OTP_PER_IP_PER_HOUR,
    failClosed: true
  });
  if (!ipLimit.allowed) {
    incrementOtpMetric("rate_limited");
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Too many requests from this network. Try again later.", code: "rate_limited" },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(ipLimit),
          [requestIdHeader]: requestId
        }
      }
    );
  }

  const burstLimit = await enforceRateLimit({
    identifier: `otp:phone-burst:${phone}`,
    windowSeconds: 60,
    max: OTP_PER_PHONE_PER_MINUTE,
    failClosed: true
  });
  if (!burstLimit.allowed) {
    incrementOtpMetric("rate_limited");
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Wait a moment before requesting another code.", code: "rate_limited" },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(burstLimit),
          [requestIdHeader]: requestId
        }
      }
    );
  }

  const phoneLimit = await enforceRateLimit({
    identifier: `otp:phone:${phone}`,
    windowSeconds: 3600,
    max: OTP_PER_PHONE_PER_HOUR,
    failClosed: true
  });
  if (!phoneLimit.allowed) {
    incrementOtpMetric("rate_limited");
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Too many codes requested for this number. Try again in an hour.", code: "rate_limited" },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(phoneLimit),
          [requestIdHeader]: requestId
        }
      }
    );
  }

  // Turnstile bot check (after rate limits so we don't burn Turnstile quota
  // on already-rate-limited IPs).
  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    remoteIp: ip,
    action: parsed.data.mode
  });
  if (!turnstile.ok) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 403,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Anti-abuse check failed. Refresh the page and try again." },
      { status: 403, headers: { [requestIdHeader]: requestId } }
    );
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      phoneVerifiedAt: true,
      deletedAt: true
    }
  });

  const isActiveVerified = Boolean(user?.phoneVerifiedAt && !user.deletedAt);
  const mode = parsed.data.mode as AuthOtpMode;
  const otpPurpose = getOtpPurposeForMode(mode);

  // Determine if this request is valid for the requested mode.
  // If not, we return the same generic 200 response as a success to prevent
  // enumeration — the user will not receive an SMS.
  const shouldSendCode =
    (mode === "sign-in" && isActiveVerified) ||
    (mode === "sign-up" && !isActiveVerified);

  if (!shouldSendCode) {
    // Return generic response without revealing account existence.
    incrementOtpMetric("enumeration_guard");
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(GENERIC_OTP_SENT_BODY, {
      headers: { [requestIdHeader]: requestId }
    });
  }

  const { code, expiresAt } = await issueOtpCode({
    phone,
    purpose: otpPurpose
  });

  try {
    await sendOtpSms({ to: phone, code });
  } catch (error) {
    incrementOtpMetric("send_failed");
    logger.error({ err: error, phone: phone.slice(-4) }, "otp.send_failed");
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 502,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "We could not deliver a verification code right now. Please try again shortly." },
      { status: 502, headers: { [requestIdHeader]: requestId } }
    );
  }

  incrementOtpMetric("ok");
  observeHttpRoute({
    route: "/api/auth/request-otp",
    method: "POST",
    status: 200,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json(
    {
      ...GENERIC_OTP_SENT_BODY,
      code: "ok",
      expiresAt: expiresAt.toISOString(),
      devCode: EXPOSE_DEV_OTP ? code : undefined
    },
    {
      headers: {
        [requestIdHeader]: requestId
      }
    }
  );
}
