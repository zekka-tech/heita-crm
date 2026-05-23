import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { OtpPurpose } from "@prisma/client";

import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const OTP_TTL_SECONDS = 600;

function hashOtp(phone: string, code: string) {
  return createHash("sha256")
    .update(`${phone}:${code}:${process.env.AUTH_SECRET ?? "heita-dev-secret"}`)
    .digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueOtpCode(input: { phone: string; purpose: OtpPurpose }) {
  const code = generateOtpCode();
  const codeHash = hashOtp(input.phone, code);
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
      await redis.set(`otp:phone:${input.phone}`, codeHash, "EX", OTP_TTL_SECONDS);
    } catch {
      // Redis is an optimization here; the DB remains the source of truth.
    }
  }

  return {
    code,
    expiresAt
  };
}

export async function verifyOtpAttempt(input: {
  phone: string;
  code: string;
  purpose: OtpPurpose;
}) {
  const expectedHash = hashOtp(input.phone, input.code);
  const redis = getRedis();

  if (redis) {
    try {
      const cachedHash = await redis.get(`otp:phone:${input.phone}`);

      if (cachedHash && !safeCompare(cachedHash, expectedHash)) {
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
      expiresAt: {
        gt: new Date()
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!otpRecord || !safeCompare(otpRecord.codeHash, expectedHash)) {
    return false;
  }

  await prisma.otpCode.update({
    where: {
      id: otpRecord.id
    },
    data: {
      consumedAt: new Date()
    }
  });

  if (redis) {
    try {
      await redis.del(`otp:phone:${input.phone}`);
    } catch {
      // Best-effort cleanup only.
    }
  }

  return true;
}
