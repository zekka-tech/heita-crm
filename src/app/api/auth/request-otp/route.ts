import { NextResponse } from "next/server";
import { z } from "zod";

import { getOtpPurposeForMode, type AuthOtpMode } from "@/lib/auth-intent";
import { logger } from "@/lib/logger";
import { observeHttpRoute } from "@/lib/metrics";
import { issueOtpCode } from "@/lib/otp";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { getClientIp } from "@/lib/security";
import { sendOtpSms } from "@/lib/sms";
import { verifyTurnstileToken } from "@/lib/turnstile";

const RequestOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  mode: z.enum(["sign-in", "sign-up"]).default("sign-in"),
  turnstileToken: z.string().optional()
});

const OTP_PER_PHONE_PER_HOUR = 5;
const OTP_PER_IP_PER_HOUR = 20;
const OTP_PER_PHONE_PER_MINUTE = 1;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const ip = getClientIp(request.headers);

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
    where: {
      phone
    },
    select: {
      id: true,
      phoneVerifiedAt: true,
      deletedAt: true
    }
  });

  const isActiveVerified = Boolean(user?.phoneVerifiedAt && !user.deletedAt);
  const mode = parsed.data.mode as AuthOtpMode;
  const otpPurpose = getOtpPurposeForMode(mode);

  if (mode === "sign-in") {
    if (!isActiveVerified) {
      observeHttpRoute({
        route: "/api/auth/request-otp",
        method: "POST",
        status: 404,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json(
        { error: "No verified account exists for this number yet. Create an account first." },
        { status: 404, headers: { [requestIdHeader]: requestId } }
      );
    }
  } else if (isActiveVerified) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 409,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "An account already exists for this number. Sign in instead." },
      { status: 409, headers: { [requestIdHeader]: requestId } }
    );
  }

  const ipLimit = await enforceRateLimit({
    identifier: `otp:ip:${ip}`,
    windowSeconds: 3600,
    max: OTP_PER_IP_PER_HOUR
  });
  if (!ipLimit.allowed) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Too many requests from this network. Try again later." },
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
    max: OTP_PER_PHONE_PER_MINUTE
  });
  if (!burstLimit.allowed) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Wait a moment before requesting another code." },
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
    max: OTP_PER_PHONE_PER_HOUR
  });
  if (!phoneLimit.allowed) {
    observeHttpRoute({
      route: "/api/auth/request-otp",
      method: "POST",
      status: 429,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Too many codes requested for this number. Try again in an hour." },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(phoneLimit),
          [requestIdHeader]: requestId
        }
      }
    );
  }

  const { code, expiresAt } = await issueOtpCode({
    phone,
    purpose: otpPurpose
  });

  try {
    await sendOtpSms({ to: phone, code });
  } catch (error) {
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

  observeHttpRoute({
    route: "/api/auth/request-otp",
    method: "POST",
    status: 200,
    durationMs: Date.now() - startedAt
  });
  return NextResponse.json({
    ok: true,
    message: `Verification code sent. It expires at ${expiresAt.toISOString()}.`,
    devCode: process.env.NODE_ENV !== "production" ? code : undefined
  }, {
    headers: {
      [requestIdHeader]: requestId
    }
  });
}
