import { createHmac, randomInt } from "node:crypto";

import { OtpPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { constantTimeEqual } from "@/lib/security";

const OTP_TTL_SECONDS = 600;
const MAX_OTP_ATTEMPTS = 5;

function getOtpSecret(): string {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET is required in production for OTP signing."
      );
    }
    return "heita-dev-secret-do-not-use-in-prod";
  }

  return secret;
}

function hashOtp(phone: string, code: string, purpose: OtpPurpose): string {
  return createHmac("sha256", getOtpSecret())
    .update(`${purpose}:${phone}:${code}`)
    .digest("hex");
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueOtpCode(input: {
  phone: string;
  purpose: OtpPurpose;
}): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode();
  const codeHash = hashOtp(input.phone, code, input.purpose);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await prisma.otpCode.updateMany({
    where: {
      phone: input.phone,
      purpose: input.purpose,
      consumedAt: null
    },
    data: {
      consumedAt: new Date()
    }
  });

  await prisma.otpCode.create({
    data: {
      phone: input.phone,
      codeHash,
      purpose: input.purpose,
      channel: "SMS",
      expiresAt
    }
  });

  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(
        `otp:${input.purpose}:${input.phone}`,
        codeHash,
        "EX",
        OTP_TTL_SECONDS
      );
    } catch {
      // Redis is an optimization; DB remains the source of truth.
    }
  }

  return { code, expiresAt };
}

export async function verifyOtpAttempt(input: {
  phone: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<boolean> {
  if (!/^\d{6}$/.test(input.code)) {
    return false;
  }

  const expectedHash = hashOtp(input.phone, input.code, input.purpose);
  const redis = getRedis();

  if (redis) {
    try {
      const cachedHash = await redis.get(`otp:${input.purpose}:${input.phone}`);

      if (cachedHash && !constantTimeEqual(cachedHash, expectedHash)) {
        // Fast-path reject: Redis confirms wrong code without a DB round-trip.
        // The rate limiter (per-phone + per-IP) is the primary brute-force
        // guard; the DB attempt counter catches cases where Redis is bypassed.
        return false;
      }
    } catch {
      // Ignore Redis failures and fall back to DB verification.
    }
  }

  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone: input.phone,
      purpose: input.purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!otpRecord) {
    return false;
  }

  // Lock out the code after MAX_OTP_ATTEMPTS failed attempts so brute-force
  // has a hard ceiling even if the per-phone rate limiter is bypassed.
  if (otpRecord.attemptCount >= MAX_OTP_ATTEMPTS) {
    // Consume the code to prevent further attempts.
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() }
    });
    return false;
  }

  if (!constantTimeEqual(otpRecord.codeHash, expectedHash)) {
    // Wrong code — increment attempt counter.
    const updated = await prisma.otpCode.updateMany({
      where: { id: otpRecord.id, consumedAt: null },
      data: {
        attemptCount: { increment: 1 },
        // Consume and lock out if this was the last allowed attempt.
        ...(otpRecord.attemptCount + 1 >= MAX_OTP_ATTEMPTS
          ? { consumedAt: new Date() }
          : {})
      }
    });
    if (updated.count === 0) {
      // Concurrent consume beat us — code is gone.
    }
    return false;
  }

  // Correct code — atomic consume: only one concurrent request wins.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: otpRecord.id, consumedAt: null },
    data: { consumedAt: new Date() }
  });
  if (consumed.count === 0) {
    return false;
  }

  if (redis) {
    try {
      await redis.del(`otp:${input.purpose}:${input.phone}`);
    } catch {
      // Best-effort cleanup only.
    }
  }

  return true;
}
