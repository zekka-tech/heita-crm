import { OtpPurpose } from "@prisma/client";

import { issueOtpCode, verifyOtpAttempt } from "@/lib/otp";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";

const STAFF_STEP_UP_WINDOW_SECONDS = parseInt(process.env.STAFF_STEP_UP_WINDOW_SECONDS ?? "300", 10);

function getStepUpKey(userId: string, businessId: string) {
  return `staff-step-up:${userId}:${businessId}`;
}

export async function requestStaffStepUpOtp(input: {
  phone: string;
  userId: string;
  businessId: string;
}) {
  const rl = await enforceRateLimit({
    identifier: `staff-step-up:${input.userId}:${input.businessId}`,
    windowSeconds: 15 * 60,
    max: 5
  });
  if (!rl.allowed) {
    throw new Error(
      `Too many step-up verification attempts. Try again in ${rl.resetInSeconds} seconds.`
    );
  }
  return issueOtpCode({
    phone: input.phone,
    purpose: OtpPurpose.STAFF_STEP_UP
  });
}

export async function verifyStaffStepUpOtp(input: {
  userId: string;
  businessId: string;
  phone: string;
  code: string;
}) {
  const verified = await verifyOtpAttempt({
    phone: input.phone,
    code: input.code,
    purpose: OtpPurpose.STAFF_STEP_UP
  });

  if (!verified) {
    return false;
  }

  const redis = getRedis();
  const key = getStepUpKey(input.userId, input.businessId);

  if (!redis) {
    throw new Error("Step-up auth requires Redis; distributed state not available");
  }

  await redis.set(key, "1", "EX", STAFF_STEP_UP_WINDOW_SECONDS);

  return true;
}

export async function hasFreshStaffStepUp(input: {
  userId: string;
  businessId: string;
}) {
  const key = getStepUpKey(input.userId, input.businessId);
  const redis = getRedis();

  if (!redis) {
    throw new Error("Step-up auth requires Redis; distributed state not available");
  }

  const value = await redis.get(key);
  return Boolean(value);
}

export async function requireFreshStaffStepUp(input: {
  userId: string;
  businessId: string;
}) {
  const fresh = await hasFreshStaffStepUp(input);

  if (!fresh) {
    throw new Error("A fresh staff verification code is required before changing business data.");
  }
}
