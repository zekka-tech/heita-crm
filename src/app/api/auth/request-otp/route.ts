import { OtpPurpose } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { issueOtpCode } from "@/lib/otp";
import { normalizeZaPhone } from "@/lib/phone";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";
import { sendOtpSms } from "@/lib/sms";

const RequestOtpSchema = z.object({
  phone: z.string().min(8).max(20)
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
    purpose: OtpPurpose.SIGN_IN
  });

  try {
    await sendOtpSms({ to: phone, code });
  } catch (error) {
    logger.error({ err: error, phone: phone.slice(-4) }, "otp.send_failed");
  }

  return NextResponse.json({
    ok: true,
    message: `Verification code sent. It expires at ${expiresAt.toISOString()}.`,
    devCode: process.env.NODE_ENV !== "production" ? code : undefined
  });
}
