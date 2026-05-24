import { NextResponse } from "next/server";
import { z } from "zod";

import { getOtpPurposeForMode, type AuthOtpMode } from "@/lib/auth-intent";
import { logger } from "@/lib/logger";
import { issueOtpCode } from "@/lib/otp";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
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
  const ip = getClientIp(request.headers);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RequestOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid phone number." },
      { status: 400 }
    );
  }

  const phone = normalizeZaPhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid South African phone number (e.g. +27 82 000 0000)." },
      { status: 400 }
    );
  }

  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    remoteIp: ip,
    action: parsed.data.mode
  });
  if (!turnstile.ok) {
    return NextResponse.json(
      { error: "Anti-abuse check failed. Refresh the page and try again." },
      { status: 403 }
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      phone
    },
    select: {
      id: true,
      phoneVerifiedAt: true
    }
  });

  const mode = parsed.data.mode as AuthOtpMode;
  const otpPurpose = getOtpPurposeForMode(mode);

  if (mode === "sign-in") {
    if (!user?.phoneVerifiedAt) {
      return NextResponse.json(
        { error: "No verified account exists for this number yet. Create an account first." },
        { status: 404 }
      );
    }
  } else if (user?.phoneVerifiedAt) {
    return NextResponse.json(
      { error: "An account already exists for this number. Sign in instead." },
      { status: 409 }
    );
  }

  const ipLimit = await enforceRateLimit({
    identifier: `otp:ip:${ip}`,
    windowSeconds: 3600,
    max: OTP_PER_IP_PER_HOUR
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests from this network. Try again later." },
      { status: 429, headers: rateLimitHeaders(ipLimit) }
    );
  }

  const burstLimit = await enforceRateLimit({
    identifier: `otp:phone-burst:${phone}`,
    windowSeconds: 60,
    max: OTP_PER_PHONE_PER_MINUTE
  });
  if (!burstLimit.allowed) {
    return NextResponse.json(
      { error: "Wait a moment before requesting another code." },
      { status: 429, headers: rateLimitHeaders(burstLimit) }
    );
  }

  const phoneLimit = await enforceRateLimit({
    identifier: `otp:phone:${phone}`,
    windowSeconds: 3600,
    max: OTP_PER_PHONE_PER_HOUR
  });
  if (!phoneLimit.allowed) {
    return NextResponse.json(
      { error: "Too many codes requested for this number. Try again in an hour." },
      { status: 429, headers: rateLimitHeaders(phoneLimit) }
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
    return NextResponse.json(
      { error: "We could not deliver a verification code right now. Please try again shortly." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Verification code sent. It expires at ${expiresAt.toISOString()}.`,
    devCode: process.env.NODE_ENV !== "production" ? code : undefined
  });
}
